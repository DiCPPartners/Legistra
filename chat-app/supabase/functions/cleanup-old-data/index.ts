import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Cleanup automatico: elimina conversazioni e messaggi vecchi di 7 giorni
// NON tocca i template (document_templates, template_categories)
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verifica autorizzazione (opzionale: rimuovi se vuoi chiamare via cron senza auth)
    const authHeader = req.headers.get('Authorization')
    const cronSecret = Deno.env.get('CRON_SECRET')
    
    // Accetta richieste da cron con secret o da utenti autenticati
    const isCronRequest = req.headers.get('x-cron-secret') === cronSecret
    
    if (!isCronRequest && !authHeader) {
      return new Response(
        JSON.stringify({ error: 'Autorizzazione richiesta' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Crea client Supabase con service role per bypassare RLS
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const retentionDays = 7
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)
    const cutoffISO = cutoffDate.toISOString()

    console.log(`Cleanup: eliminazione dati più vecchi di ${cutoffISO}`)

    // 1. Trova conversazioni da eliminare
    const { data: oldConversations, error: findError } = await supabase
      .from('conversations')
      .select('id')
      .lt('updated_at', cutoffISO)

    if (findError) {
      console.error('Errore nel trovare conversazioni:', findError)
      throw findError
    }

    const conversationIds = oldConversations?.map(c => c.id) || []
    
    if (conversationIds.length === 0) {
      console.log('Nessuna conversazione da eliminare')
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Nessuna conversazione da eliminare',
          deleted_conversations: 0,
          deleted_messages: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Elimina messaggi delle conversazioni vecchie
    const { error: messagesError, count: deletedMessages } = await supabase
      .from('conversation_messages')
      .delete({ count: 'exact' })
      .in('conversation_id', conversationIds)

    if (messagesError) {
      console.error('Errore eliminazione messaggi:', messagesError)
      throw messagesError
    }

    // 3. Elimina conversazioni vecchie
    const { error: conversationsError, count: deletedConversations } = await supabase
      .from('conversations')
      .delete({ count: 'exact' })
      .in('id', conversationIds)

    if (conversationsError) {
      console.error('Errore eliminazione conversazioni:', conversationsError)
      throw conversationsError
    }

    console.log(`Cleanup completato: ${deletedConversations} conversazioni, ${deletedMessages} messaggi eliminati`)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Cleanup completato',
        deleted_conversations: deletedConversations || 0,
        deleted_messages: deletedMessages || 0,
        cutoff_date: cutoffISO,
        note: 'I template (document_templates) NON sono stati toccati'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Errore cleanup:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
