/**
 * Script per generare embeddings per i template esistenti
 * 
 * USO:
 * npm run generate-embeddings
 * 
 * Oppure direttamente:
 * node scripts/generate-embeddings.js
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'

// Carica variabili d'ambiente
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const envPath = join(__dirname, '..', '.env')

try {
  const envFile = readFileSync(envPath, 'utf-8')
  const envVars = {}
  envFile.split('\n').forEach(line => {
    const match = line.match(/^VITE_([^=]+)=(.*)$/)
    if (match) {
      const key = match[1]
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      envVars[key] = value
    }
  })
  
  // Imposta le variabili d'ambiente
  process.env.VITE_SUPABASE_URL = envVars.SUPABASE_URL
  process.env.VITE_SUPABASE_ANON_KEY = envVars.SUPABASE_ANON_KEY
  process.env.VITE_OPENAI_API_KEY = envVars.OPENAI_API_KEY
} catch (error) {
  console.error('Errore nel caricamento del file .env:', error.message)
  console.log('Assicurati che il file .env esista nella directory chat-app/')
  process.exit(1)
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const OPENAI_API_KEY = process.env.VITE_OPENAI_API_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Errore: VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY devono essere impostate nel file .env')
  process.exit(1)
}

if (!OPENAI_API_KEY) {
  console.error('❌ Errore: VITE_OPENAI_API_KEY deve essere impostata nel file .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

/**
 * Genera un embedding usando OpenAI
 */
async function generateEmbedding(text) {
  const EMBEDDINGS_API_URL = 'https://api.openai.com/v1/embeddings'
  const EMBEDDING_MODEL = 'text-embedding-3-small'
  const MAX_EMBEDDING_TEXT_LENGTH = 8000

  const textToEmbed = text.trim().slice(0, MAX_EMBEDDING_TEXT_LENGTH)

  const response = await fetch(EMBEDDINGS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: textToEmbed,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI Embeddings API error (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  const embedding = data?.data?.[0]?.embedding

  if (!embedding || !Array.isArray(embedding)) {
    throw new Error('OpenAI non ha restituito un embedding valido.')
  }

  return embedding
}

/**
 * Genera e salva embedding per un template
 */
async function generateAndSaveEmbedding(template) {
  if (!template.original_content || !template.original_content.trim()) {
    console.warn(`⚠️  Template "${template.file_name}" non ha contenuto, salto`)
    return false
  }

  try {
    console.log(`🔄 Generando embedding per: ${template.file_name}...`)
    const embedding = await generateEmbedding(template.original_content)

    const { error } = await supabase
      .from('document_templates')
      .update({ embedding })
      .eq('id', template.id)

    if (error) {
      throw error
    }

    console.log(`✅ Embedding salvato per: ${template.file_name}`)
    return true
  } catch (error) {
    console.error(`❌ Errore per "${template.file_name}":`, error.message)
    return false
  }
}

/**
 * Funzione principale
 */
async function main() {
  console.log('🚀 Avvio generazione embeddings per template esistenti...\n')

  // Verifica autenticazione
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    console.error('❌ Errore: Devi essere autenticato per eseguire questo script')
    console.log('\n💡 Soluzione:')
    console.log('   1. Accedi all\'app MyMED nel browser')
    console.log('   2. Apri la console del browser (F12)')
    console.log('   3. Copia il token di sessione da localStorage')
    console.log('   4. Oppure usa questo script solo per template nuovi (che generano automaticamente l\'embedding)')
    process.exit(1)
  }

  console.log(`👤 Utente autenticato: ${user.email}\n`)

  // Recupera tutti i template dell'utente
  const { data: templates, error: fetchError } = await supabase
    .from('document_templates')
    .select('id, file_name, original_content, embedding')
    .eq('user_id', user.id)

  if (fetchError) {
    console.error('❌ Errore nel recupero template:', fetchError.message)
    process.exit(1)
  }

  if (!templates || templates.length === 0) {
    console.log('ℹ️  Nessun template trovato')
    process.exit(0)
  }

  // Filtra solo i template che non hanno embedding
  const templatesToProcess = templates.filter(
    (t) => t.original_content && t.original_content.trim() && !t.embedding
  )

  if (templatesToProcess.length === 0) {
    console.log('✅ Tutti i template hanno già un embedding!')
    process.exit(0)
  }

  console.log(`📊 Trovati ${templates.length} template totali`)
  console.log(`🔄 ${templatesToProcess.length} template senza embedding da processare\n`)

  let successCount = 0
  let errorCount = 0

  // Processa ogni template
  for (let i = 0; i < templatesToProcess.length; i++) {
    const template = templatesToProcess[i]
    console.log(`[${i + 1}/${templatesToProcess.length}]`, end=' ')
    
    const success = await generateAndSaveEmbedding(template)
    if (success) {
      successCount++
    } else {
      errorCount++
    }

    // Piccola pausa per non sovraccaricare l'API
    if (i < templatesToProcess.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }

  console.log('\n' + '='.repeat(50))
  console.log('📊 Riepilogo:')
  console.log(`   ✅ Completati: ${successCount}`)
  console.log(`   ❌ Errori: ${errorCount}`)
  console.log(`   📁 Totali: ${templatesToProcess.length}`)
  console.log('='.repeat(50))
}

// Esegui lo script
main().catch((error) => {
  console.error('❌ Errore fatale:', error)
  process.exit(1)
})
