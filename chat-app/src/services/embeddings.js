/**
 * Servizio per generare embeddings con OpenAI
 */

const EMBEDDING_API_URL = 'https://api.openai.com/v1/embeddings'
const EMBEDDING_MODEL = 'text-embedding-3-small' // 1536 dimensioni, economico
const MAX_BATCH_SIZE = 100 // OpenAI supporta fino a 2048, ma meglio batch più piccoli
const MAX_RETRIES = 3
const RETRY_DELAY = 1000

/**
 * Genera embedding per un singolo testo
 * 
 * @param {string} text - Testo da embeddare
 * @param {string} apiKey - API key OpenAI
 * @returns {Promise<number[]>} Vettore embedding 1536 dimensioni
 */
export async function generateEmbedding(text, apiKey) {
  if (!text || !text.trim()) {
    throw new Error('Testo vuoto per embedding')
  }
  
  if (!apiKey) {
    throw new Error('API key OpenAI mancante')
  }
  
  let lastError = null
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(EMBEDDING_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: text.trim().substring(0, 8000), // Limita a ~8000 caratteri
          encoding_format: 'float'
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        
        // Rate limit - aspetta e riprova
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '5')
          await new Promise(r => setTimeout(r, retryAfter * 1000))
          continue
        }
        
        throw new Error(errorData.error?.message || `Errore API: ${response.status}`)
      }
      
      const data = await response.json()
      return data.data[0].embedding
      
    } catch (error) {
      lastError = error
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, RETRY_DELAY * Math.pow(2, attempt)))
      }
    }
  }
  
  throw lastError || new Error('Errore generazione embedding')
}

/**
 * Genera embeddings per un batch di testi
 * 
 * @param {string[]} texts - Array di testi
 * @param {string} apiKey - API key OpenAI
 * @param {Function} onProgress - Callback per progresso (opzionale)
 * @returns {Promise<number[][]>} Array di vettori embedding
 */
export async function generateEmbeddingsBatch(texts, apiKey, onProgress = () => {}) {
  if (!texts || texts.length === 0) {
    return []
  }
  
  const results = []
  const batches = []
  
  // Dividi in batch
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    batches.push(texts.slice(i, i + MAX_BATCH_SIZE))
  }
  
  let processed = 0
  
  for (const batch of batches) {
    try {
      const response = await fetch(EMBEDDING_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: batch.map(t => t.trim().substring(0, 8000)),
          encoding_format: 'float'
        })
      })
      
      if (!response.ok) {
        // Fallback: genera uno alla volta
        for (const text of batch) {
          try {
            const embedding = await generateEmbedding(text, apiKey)
            results.push(embedding)
          } catch (e) {
            console.error('Errore embedding singolo:', e)
            results.push(null) // Placeholder per chunk fallito
          }
          processed++
          onProgress(processed, texts.length)
        }
        continue
      }
      
      const data = await response.json()
      
      // Ordina per index (OpenAI può restituire in ordine diverso)
      const sortedEmbeddings = data.data
        .sort((a, b) => a.index - b.index)
        .map(item => item.embedding)
      
      results.push(...sortedEmbeddings)
      processed += batch.length
      onProgress(processed, texts.length)
      
    } catch (error) {
      console.error('Errore batch embeddings:', error)
      // Aggiungi null per ogni elemento del batch fallito
      results.push(...batch.map(() => null))
      processed += batch.length
      onProgress(processed, texts.length)
    }
    
    // Piccola pausa tra batch per evitare rate limiting
    if (batches.indexOf(batch) < batches.length - 1) {
      await new Promise(r => setTimeout(r, 100))
    }
  }
  
  return results
}

/**
 * Calcola la similarità coseno tra due vettori
 */
export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0
  }
  
  let dotProduct = 0
  let normA = 0
  let normB = 0
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB)
  return magnitude === 0 ? 0 : dotProduct / magnitude
}

/**
 * Trova i chunks più simili a una query (ricerca locale)
 * Usato come fallback se la ricerca DB non è disponibile
 * 
 * @param {number[]} queryEmbedding - Embedding della query
 * @param {Array<{embedding: number[], ...}>} chunks - Chunks con embeddings
 * @param {number} topK - Numero di risultati
 * @param {number} threshold - Soglia minima similarità
 * @returns {Array} Chunks ordinati per similarità
 */
export function findSimilarChunks(queryEmbedding, chunks, topK = 10, threshold = 0.7) {
  if (!queryEmbedding || !chunks || chunks.length === 0) {
    return []
  }
  
  const scored = chunks
    .map(chunk => ({
      ...chunk,
      similarity: cosineSimilarity(queryEmbedding, chunk.embedding)
    }))
    .filter(chunk => chunk.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
  
  return scored
}

export default {
  generateEmbedding,
  generateEmbeddingsBatch,
  cosineSimilarity,
  findSimilarChunks,
  EMBEDDING_MODEL
}
