import { supabase } from './supabaseClient'

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  const userId = data?.user?.id
  if (!userId) {
    throw new Error('Utente non autenticato.')
  }
  return userId
}

export async function fetchConversations() {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, title, created_at, updated_at, conversation_messages ( id, role, content, metadata, created_at )')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: true, referencedTable: 'conversation_messages' })

  if (error) throw error

  return (data ?? []).map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.created_at,
    updatedAt: conversation.updated_at,
    messages: (conversation.conversation_messages ?? [])
      .map((message) => ({
        id: message.id,
        role: message.role,
        text: message.content,
        metadata: message.metadata,
        createdAt: message.created_at,
      })),
  }))
}

export async function createConversation({ title }) {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('conversations')
    .insert({ title, user_id: userId })
    .select('id, title, created_at, updated_at')
    .single()

  if (error) throw error
  return data
}

export async function updateConversationTitle({ conversationId, title }) {
  const { error } = await supabase
    .from('conversations')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', conversationId)

  if (error) throw error
}

export async function deleteConversation({ conversationId }) {
  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', conversationId)

  if (error) throw error
}

export async function appendMessages({ conversationId, messages }) {
  if (!messages?.length) return

  const payload = messages.map((message) => ({
    conversation_id: conversationId,
    role: message.role,
    content: message.text,
    metadata: message.metadata ?? {},
  }))

  const { error } = await supabase
    .from('conversation_messages')
    .insert(payload)

  if (error) throw error
}

export async function updateMessage({ messageId, content, metadata }) {
  const updates = {}
  if (content !== undefined) updates.content = content
  if (metadata !== undefined) updates.metadata = metadata

  const { error } = await supabase
    .from('conversation_messages')
    .update(updates)
    .eq('id', messageId)

  if (error) throw error
}
