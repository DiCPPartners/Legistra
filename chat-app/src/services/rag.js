/**
 * Servizio RAG (Retrieval-Augmented Generation) per documenti
 * Gestisce chunking, embeddings e ricerca semantica
 */

import { supabase } from './supabaseClient'
import { chunkDocument, chunkMultipleDocuments, getChunkStats } from './chunking'
import { generateEmbedding, generateEmbeddingsBatch, findSimilarChunks } from './embeddings'

// Configurazione RAG
const RAG_CONFIG = {
  DEFAULT_TOP_K: 10,           // Numero di chunks da recuperare
  SIMILARITY_THRESHOLD: 0.65,   // Soglia minima similarità
  MAX_CONTEXT_TOKENS: 12000,    // Token massimi per contesto RAG
  ENABLE_RERANKING: true,       // Riordina risultati per rilevanza
}

/**
 * Indicizza un documento: chunking + embeddings + salvataggio
 * 
 * @param {string} text - Testo del documento
 * @param {string} documentName - Nome del documento
 * @param {Object} options - Opzioni
 * @returns {Promise<Object>} Statistiche indicizzazione
 */
export async function indexDocument({
  text,
  documentName,
  userId,
  conversationId,
  batchId,
  apiKey,
  onProgress = () => {}
}) {
  if (!text || !documentName || !userId || !apiKey) {
    throw new Error('Parametri mancanti per indicizzazione')
  }
  
  onProgress(0, 'Divisione documento in chunks...')
  
  // 1. Chunking
  const chunks = chunkDocument(text, documentName)
  const stats = getChunkStats(chunks)
  
  if (chunks.length === 0) {
    return { success: false, message: 'Documento vuoto o non elaborabile' }
  }
  
  onProgress(10, `Creati ${chunks.length} chunks, generazione embeddings...`)
  
  // 2. Genera embeddings
  const texts = chunks.map(c => c.content)
  const embeddings = await generateEmbeddingsBatch(texts, apiKey, (done, total) => {
    const progress = 10 + Math.round((done / total) * 70)
    onProgress(progress, `Embeddings: ${done}/${total}`)
  })
  
  onProgress(85, 'Salvataggio in database...')
  
  // 3. Prepara dati per inserimento
  const chunkRecords = chunks.map((chunk, i) => ({
    user_id: userId,
    conversation_id: conversationId || null,
    batch_id: batchId || null,
    document_name: chunk.documentName,
    chunk_index: chunk.chunkIndex,
    content: chunk.content,
    embedding: embeddings[i] ? `[${embeddings[i].join(',')}]` : null,
    metadata: chunk.metadata
  }))
  
  // 4. Elimina chunks esistenti per questo documento (se presenti)
  if (conversationId) {
    await supabase
      .from('document_chunks')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('document_name', documentName)
  }
  
  // 5. Inserisci nuovi chunks (in batch da 50)
  const batchSize = 50
  let insertedCount = 0
  
  for (let i = 0; i < chunkRecords.length; i += batchSize) {
    const batch = chunkRecords.slice(i, i + batchSize)
    const { error } = await supabase.from('document_chunks').insert(batch)
    
    if (error) {
      console.error('Errore inserimento chunks:', error)
      // Continua comunque con gli altri batch
    } else {
      insertedCount += batch.length
    }
  }
  
  onProgress(100, 'Indicizzazione completata')
  
  return {
    success: true,
    documentName,
    chunksCreated: chunks.length,
    chunksInserted: insertedCount,
    totalTokens: stats.totalTokens,
    avgTokensPerChunk: stats.avgTokensPerChunk
  }
}

/**
 * Indicizza più documenti
 */
export async function indexMultipleDocuments({
  documents, // Array di {name: string, text: string}
  userId,
  conversationId,
  batchId,
  apiKey,
  onProgress = () => {}
}) {
  const results = []
  const totalDocs = documents.length
  
  for (let i = 0; i < totalDocs; i++) {
    const doc = documents[i]
    const docProgress = (progress, message) => {
      const overallProgress = Math.round((i / totalDocs + progress / 100 / totalDocs) * 100)
      onProgress(overallProgress, `[${i + 1}/${totalDocs}] ${doc.name}: ${message}`)
    }
    
    try {
      const result = await indexDocument({
        text: doc.text,
        documentName: doc.name,
        userId,
        conversationId,
        batchId,
        apiKey,
        onProgress: docProgress
      })
      results.push(result)
    } catch (error) {
      console.error(`Errore indicizzazione ${doc.name}:`, error)
      results.push({ success: false, documentName: doc.name, error: error.message })
    }
  }
  
  return {
    indexed: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    details: results
  }
}

/**
 * Cerca chunks rilevanti per una query
 * 
 * @param {string} query - Domanda dell'utente
 * @param {Object} options - Opzioni di ricerca
 * @returns {Promise<Array>} Chunks rilevanti ordinati per similarità
 */
export async function searchChunks({
  query,
  userId,
  conversationId = null,
  apiKey,
  topK = RAG_CONFIG.DEFAULT_TOP_K,
  threshold = RAG_CONFIG.SIMILARITY_THRESHOLD
}) {
  if (!query || !userId || !apiKey) {
    throw new Error('Parametri mancanti per ricerca')
  }
  
  // 1. Genera embedding della query
  const queryEmbedding = await generateEmbedding(query, apiKey)
  
  // 2. Cerca nel database usando la funzione SQL
  const { data, error } = await supabase.rpc('search_document_chunks', {
    query_embedding: `[${queryEmbedding.join(',')}]`,
    user_id_filter: userId,
    conversation_id_filter: conversationId,
    limit_count: topK,
    similarity_threshold: threshold
  })
  
  if (error) {
    console.error('Errore ricerca chunks:', error)
    
    // Fallback: ricerca locale se la funzione RPC non esiste
    if (error.code === '42883') { // function does not exist
      return await searchChunksLocal({
        queryEmbedding,
        userId,
        conversationId,
        topK,
        threshold
      })
    }
    
    throw error
  }
  
  return data || []
}

/**
 * Ricerca locale (fallback se RPC non disponibile)
 */
async function searchChunksLocal({
  queryEmbedding,
  userId,
  conversationId,
  topK,
  threshold
}) {
  // Carica tutti i chunks della conversazione
  let query = supabase
    .from('document_chunks')
    .select('id, content, document_name, chunk_index, embedding, metadata')
    .eq('user_id', userId)
  
  if (conversationId) {
    query = query.eq('conversation_id', conversationId)
  }
  
  const { data, error } = await query
  
  if (error) throw error
  if (!data || data.length === 0) return []
  
  // Converti embeddings da stringa a array
  const chunksWithEmbeddings = data
    .filter(c => c.embedding)
    .map(c => ({
      ...c,
      embedding: typeof c.embedding === 'string' 
        ? JSON.parse(c.embedding) 
        : c.embedding
    }))
  
  // Trova chunks simili localmente
  return findSimilarChunks(queryEmbedding, chunksWithEmbeddings, topK, threshold)
}

/**
 * Costruisce il contesto RAG per una query
 * Recupera chunks rilevanti e li formatta per il prompt
 * 
 * @param {string} query - Domanda dell'utente
 * @param {Object} options - Opzioni
 * @returns {Promise<Object>} Contesto formattato e metadati
 */
export async function buildRAGContext({
  query,
  userId,
  conversationId,
  apiKey,
  maxTokens = RAG_CONFIG.MAX_CONTEXT_TOKENS
}) {
  // 1. Cerca chunks rilevanti
  const chunks = await searchChunks({
    query,
    userId,
    conversationId,
    apiKey,
    topK: 15, // Recupera più del necessario per poi filtrare
    threshold: 0.6
  })
  
  if (!chunks || chunks.length === 0) {
    return {
      context: '',
      chunks: [],
      tokensUsed: 0,
      documentsUsed: []
    }
  }
  
  // 2. Seleziona chunks fino a raggiungere maxTokens
  const selectedChunks = []
  let tokensUsed = 0
  const documentsUsed = new Set()
  
  for (const chunk of chunks) {
    const chunkTokens = Math.ceil(chunk.content.length / 4)
    
    if (tokensUsed + chunkTokens > maxTokens) {
      break
    }
    
    selectedChunks.push(chunk)
    tokensUsed += chunkTokens
    documentsUsed.add(chunk.document_name)
  }
  
  // 3. Formatta contesto
  const contextParts = selectedChunks.map((chunk, i) => {
    const source = chunk.document_name
    const relevance = Math.round((chunk.similarity || 0) * 100)
    return `[Fonte: ${source}]\n${chunk.content}`
  })
  
  const context = contextParts.join('\n\n---\n\n')
  
  return {
    context,
    chunks: selectedChunks,
    tokensUsed,
    documentsUsed: [...documentsUsed],
    chunksCount: selectedChunks.length
  }
}

/**
 * Verifica se esistono chunks per una conversazione
 */
export async function hasIndexedChunks(conversationId, userId) {
  const { count, error } = await supabase
    .from('document_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
  
  if (error) {
    console.error('Errore verifica chunks:', error)
    return false
  }
  
  return count > 0
}

/**
 * Ottiene statistiche sui chunks indicizzati
 */
export async function getIndexStats(conversationId, userId) {
  const { data, error } = await supabase
    .from('document_chunks')
    .select('document_name, chunk_index, token_count')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
  
  if (error || !data) {
    return null
  }
  
  const documents = [...new Set(data.map(c => c.document_name))]
  const totalChunks = data.length
  const totalTokens = data.reduce((sum, c) => sum + (c.token_count || 0), 0)
  
  return {
    documents,
    documentsCount: documents.length,
    totalChunks,
    totalTokens,
    avgTokensPerChunk: totalChunks > 0 ? Math.round(totalTokens / totalChunks) : 0
  }
}

/**
 * Elimina tutti i chunks di una conversazione
 */
export async function deleteConversationChunks(conversationId) {
  const { error } = await supabase
    .from('document_chunks')
    .delete()
    .eq('conversation_id', conversationId)
  
  if (error) {
    console.error('Errore eliminazione chunks:', error)
    throw error
  }
  
  return true
}

export default {
  indexDocument,
  indexMultipleDocuments,
  searchChunks,
  buildRAGContext,
  hasIndexedChunks,
  getIndexStats,
  deleteConversationChunks,
  RAG_CONFIG
}
