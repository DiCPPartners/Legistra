/**
 * Servizio per dividere documenti in chunks ottimizzati per RAG
 */

// Configurazione chunking
const CONFIG = {
  CHUNK_SIZE: 800,        // Parole per chunk (ottimale per embeddings)
  CHUNK_OVERLAP: 100,     // Parole di overlap tra chunks
  MIN_CHUNK_SIZE: 100,    // Dimensione minima chunk
  SEPARATOR_PATTERNS: [
    /\n#{1,6}\s/,         // Markdown headers
    /\n\n+/,              // Doppio a capo
    /\.\s+(?=[A-Z])/,     // Fine frase seguita da maiuscola
    /;\s+/,               // Punto e virgola
    /,\s+/,               // Virgola
  ]
}

/**
 * Divide il testo in parole
 */
function tokenize(text) {
  return text.split(/\s+/).filter(word => word.length > 0)
}

/**
 * Ricostruisce il testo da un array di parole
 */
function detokenize(words) {
  return words.join(' ')
}

/**
 * Trova il punto di split migliore vicino a una posizione target
 */
function findBestSplitPoint(text, targetPos, searchRange = 200) {
  const start = Math.max(0, targetPos - searchRange)
  const end = Math.min(text.length, targetPos + searchRange)
  const searchText = text.substring(start, end)
  
  // Cerca separatori in ordine di priorità
  for (const pattern of CONFIG.SEPARATOR_PATTERNS) {
    const matches = [...searchText.matchAll(new RegExp(pattern, 'g'))]
    if (matches.length > 0) {
      // Trova il match più vicino al centro
      const centerOffset = targetPos - start
      let bestMatch = matches[0]
      let bestDistance = Math.abs(matches[0].index - centerOffset)
      
      for (const match of matches) {
        const distance = Math.abs(match.index - centerOffset)
        if (distance < bestDistance) {
          bestDistance = distance
          bestMatch = match
        }
      }
      
      return start + bestMatch.index + bestMatch[0].length
    }
  }
  
  // Fallback: split su spazio più vicino
  const spaceIndex = text.indexOf(' ', targetPos)
  return spaceIndex !== -1 ? spaceIndex : targetPos
}

/**
 * Divide un documento in chunks con overlap
 * 
 * @param {string} text - Testo del documento
 * @param {string} documentName - Nome del documento
 * @param {Object} options - Opzioni di chunking
 * @returns {Array<Object>} Array di chunks
 */
export function chunkDocument(text, documentName, options = {}) {
  const {
    chunkSize = CONFIG.CHUNK_SIZE,
    chunkOverlap = CONFIG.CHUNK_OVERLAP,
    minChunkSize = CONFIG.MIN_CHUNK_SIZE,
  } = options
  
  if (!text || text.trim().length === 0) {
    return []
  }
  
  const chunks = []
  const words = tokenize(text)
  const totalWords = words.length
  
  // Se il documento è piccolo, restituisci un solo chunk
  if (totalWords <= chunkSize) {
    return [{
      content: text.trim(),
      documentName,
      chunkIndex: 0,
      metadata: {
        totalChunks: 1,
        wordCount: totalWords,
        charCount: text.length,
        isComplete: true
      }
    }]
  }
  
  let startWord = 0
  let chunkIndex = 0
  
  while (startWord < totalWords) {
    // Calcola fine chunk
    let endWord = Math.min(startWord + chunkSize, totalWords)
    
    // Estrai chunk
    const chunkWords = words.slice(startWord, endWord)
    let chunkText = detokenize(chunkWords)
    
    // Trova punto di split naturale se non siamo alla fine
    if (endWord < totalWords) {
      const targetPos = chunkText.length
      const splitPos = findBestSplitPoint(text.substring(
        text.indexOf(chunkWords[0]),
        text.indexOf(chunkWords[0]) + chunkText.length + 200
      ), targetPos)
      
      if (splitPos > minChunkSize) {
        chunkText = chunkText.substring(0, splitPos).trim()
      }
    }
    
    // Verifica dimensione minima
    if (chunkText.split(/\s+/).length >= minChunkSize || startWord + chunkSize >= totalWords) {
      chunks.push({
        content: chunkText,
        documentName,
        chunkIndex,
        metadata: {
          totalChunks: null, // Sarà aggiornato alla fine
          wordCount: chunkText.split(/\s+/).length,
          charCount: chunkText.length,
          startWord,
          endWord: startWord + chunkText.split(/\s+/).length
        }
      })
      chunkIndex++
    }
    
    // Avanza con overlap
    startWord = Math.max(startWord + 1, endWord - chunkOverlap)
    
    // Evita loop infiniti
    if (startWord >= totalWords - minChunkSize && chunks.length > 0) {
      break
    }
  }
  
  // Aggiorna totalChunks in tutti i chunks
  const totalChunks = chunks.length
  chunks.forEach(chunk => {
    chunk.metadata.totalChunks = totalChunks
  })
  
  return chunks
}

/**
 * Divide più documenti in chunks
 * 
 * @param {Array<{name: string, text: string}>} documents - Array di documenti
 * @param {Object} options - Opzioni di chunking
 * @returns {Array<Object>} Array di tutti i chunks
 */
export function chunkMultipleDocuments(documents, options = {}) {
  const allChunks = []
  
  for (const doc of documents) {
    const chunks = chunkDocument(doc.text, doc.name, options)
    allChunks.push(...chunks)
  }
  
  return allChunks
}

/**
 * Stima il numero di token per un testo (approssimativo)
 * OpenAI usa ~4 caratteri per token in italiano
 */
export function estimateTokens(text) {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

/**
 * Calcola statistiche sui chunks
 */
export function getChunkStats(chunks) {
  if (!chunks || chunks.length === 0) {
    return {
      totalChunks: 0,
      totalTokens: 0,
      avgTokensPerChunk: 0,
      documents: []
    }
  }
  
  const totalTokens = chunks.reduce((sum, chunk) => sum + estimateTokens(chunk.content), 0)
  const documents = [...new Set(chunks.map(c => c.documentName))]
  
  return {
    totalChunks: chunks.length,
    totalTokens,
    avgTokensPerChunk: Math.round(totalTokens / chunks.length),
    documents,
    documentsCount: documents.length
  }
}

export default {
  chunkDocument,
  chunkMultipleDocuments,
  estimateTokens,
  getChunkStats,
  CONFIG
}
