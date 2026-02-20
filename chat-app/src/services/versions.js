/**
 * Servizio per gestione cronologia versioni analisi
 */

import { supabase } from './supabaseClient'

/**
 * Salva una nuova versione di un'analisi
 */
export async function saveAnalysisVersion({
  userId,
  conversationId,
  messageId = null,
  actionType,
  title,
  content,
  documentsUsed = null,
  promptUsed = null,
  metadata = {}
}) {
  // Prova a usare la funzione RPC
  try {
    const { data, error } = await supabase.rpc('save_analysis_version', {
      p_user_id: userId,
      p_conversation_id: conversationId,
      p_message_id: messageId,
      p_action_type: actionType,
      p_title: title,
      p_content: content,
      p_documents_used: documentsUsed,
      p_prompt_used: promptUsed,
      p_metadata: metadata
    })
    
    if (error) throw error
    return data
  } catch (rpcError) {
    // Fallback: inserimento manuale
    console.warn('RPC fallback per salvataggio versione:', rpcError.message)
    
    // Trova prossima versione
    const { data: existing } = await supabase
      .from('analysis_versions')
      .select('version')
      .eq('conversation_id', conversationId)
      .eq('action_type', actionType)
      .order('version', { ascending: false })
      .limit(1)
    
    const nextVersion = (existing?.[0]?.version || 0) + 1
    
    const { data, error } = await supabase
      .from('analysis_versions')
      .insert({
        user_id: userId,
        conversation_id: conversationId,
        message_id: messageId,
        action_type: actionType,
        title,
        content,
        version: nextVersion,
        documents_used: documentsUsed,
        prompt_used: promptUsed,
        metadata
      })
      .select()
      .single()
    
    if (error) throw error
    return data
  }
}

/**
 * Ottiene tutte le versioni per una conversazione
 */
export async function getVersionHistory(conversationId, actionType = null) {
  let query = supabase
    .from('analysis_versions')
    .select('id, action_type, title, version, content, created_at, documents_used, prompt_used')
    .eq('conversation_id', conversationId)
    .order('action_type')
    .order('version', { ascending: false })
  
  if (actionType) {
    query = query.eq('action_type', actionType)
  }
  
  const { data, error } = await query
  
  if (error) throw error
  return data || []
}

/**
 * Ottiene una versione specifica
 */
export async function getVersion(versionId) {
  const { data, error } = await supabase
    .from('analysis_versions')
    .select('*')
    .eq('id', versionId)
    .single()
  
  if (error) throw error
  return data
}

/**
 * Ottiene l'ultima versione per un tipo di azione
 */
export async function getLatestVersion(conversationId, actionType) {
  const { data, error } = await supabase
    .from('analysis_versions')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('action_type', actionType)
    .order('version', { ascending: false })
    .limit(1)
    .single()
  
  if (error && error.code !== 'PGRST116') throw error // Ignora "no rows"
  return data || null
}

/**
 * Confronta due versioni
 */
export async function compareVersions(versionId1, versionId2) {
  const [v1, v2] = await Promise.all([
    getVersion(versionId1),
    getVersion(versionId2)
  ])
  
  if (!v1 || !v2) {
    throw new Error('Versioni non trovate')
  }
  
  // Calcola differenze semplici
  const v1Lines = v1.content.split('\n')
  const v2Lines = v2.content.split('\n')
  
  const added = v2Lines.filter(line => !v1Lines.includes(line)).length
  const removed = v1Lines.filter(line => !v2Lines.includes(line)).length
  
  return {
    version1: v1,
    version2: v2,
    stats: {
      v1Length: v1.content.length,
      v2Length: v2.content.length,
      lengthDiff: v2.content.length - v1.content.length,
      linesAdded: added,
      linesRemoved: removed
    }
  }
}

/**
 * Ripristina una versione precedente come nuova versione
 */
export async function restoreVersion(versionId, userId) {
  const version = await getVersion(versionId)
  
  if (!version) {
    throw new Error('Versione non trovata')
  }
  
  // Crea nuova versione con contenuto di quella precedente
  return saveAnalysisVersion({
    userId,
    conversationId: version.conversation_id,
    actionType: version.action_type,
    title: `${version.title} (ripristinato)`,
    content: version.content,
    documentsUsed: version.documents_used,
    promptUsed: `Ripristinato da versione ${version.version}`,
    metadata: {
      restored_from: versionId,
      restored_version: version.version
    }
  })
}

/**
 * Elimina una versione specifica
 */
export async function deleteVersion(versionId) {
  const { error } = await supabase
    .from('analysis_versions')
    .delete()
    .eq('id', versionId)
  
  if (error) throw error
  return true
}

/**
 * Ottiene statistiche versioni per una conversazione
 */
export async function getVersionStats(conversationId) {
  const { data, error } = await supabase
    .from('analysis_versions')
    .select('action_type, version')
    .eq('conversation_id', conversationId)
  
  if (error) throw error
  
  const stats = {}
  for (const v of (data || [])) {
    if (!stats[v.action_type]) {
      stats[v.action_type] = { count: 0, latestVersion: 0 }
    }
    stats[v.action_type].count++
    if (v.version > stats[v.action_type].latestVersion) {
      stats[v.action_type].latestVersion = v.version
    }
  }
  
  return stats
}

/**
 * Ottiene tipi di azione con label leggibili
 */
export const ACTION_TYPE_LABELS = {
  'trascrizione': 'Trascrizione',
  'analisi-medico-legale': 'Analisi Medico-Legale',
  'estrazione-dati': 'Estrazione Dati',
  'timeline-eventi': 'Timeline Eventi',
  'analisi-coerenza': 'Analisi Coerenza',
  'nesso-causale': 'Nesso Causale',
  'completezza-documentale': 'Completezza Documentale',
  'responsabilita-professionale': 'Responsabilità Professionale',
  'invalidita-civile': 'Invalidità Civile',
  'infortunistica': 'Infortunistica',
  'malpractice': 'Malpractice',
  'report-strutturato': 'Report Strutturato',
  'confronto-documenti': 'Confronto Documenti',
  'elementi-critici': 'Elementi Critici',
  'analisi-legale-assicurativa': 'Analisi Legale/Assicurativa'
}

export function getActionTypeLabel(actionType) {
  return ACTION_TYPE_LABELS[actionType] || actionType
}

export default {
  saveAnalysisVersion,
  getVersionHistory,
  getVersion,
  getLatestVersion,
  compareVersions,
  restoreVersion,
  deleteVersion,
  getVersionStats,
  getActionTypeLabel,
  ACTION_TYPE_LABELS
}
