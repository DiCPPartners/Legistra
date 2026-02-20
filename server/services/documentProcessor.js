/**
 * Document Processor - Server-side
 * Elabora PDF e documenti Word con librerie native Node.js
 * Con caching intelligente per evitare ri-elaborazioni
 */

import { readFile, unlink } from 'fs/promises'
import { createHash } from 'crypto'
import { createCanvas } from 'canvas'
import { callOpenAI, performOCR } from './aiService.js'
import { getCache, CacheKeys } from './cacheService.js'
import { createContextLogger } from './logger.js'
import pdfParse from 'pdf-parse'

const log = createContextLogger('DocumentProcessor')

// Importa pdfjs-dist per Node.js (versione 3.x stabile)
import pdfjsModule from 'pdfjs-dist/legacy/build/pdf.js'
const pdfjsLib = pdfjsModule.default || pdfjsModule

// Cache TTL: 24 ore per trascrizioni
const CACHE_TTL = 24 * 60 * 60 * 1000

/**
 * Genera hash del contenuto per caching
 */
function generateContentHash(buffer) {
  return createHash('sha256').update(buffer).digest('hex').slice(0, 16)
}

/**
 * Elabora un singolo documento (con caching)
 */
export async function processDocument(job, onProgress = () => {}) {
  const { filePath, fileName, skipCache = false } = job
  const cache = getCache()
  
  try {
    onProgress(5, 'Lettura file...')
    
    const fileBuffer = await readFile(filePath)
    const contentHash = generateContentHash(fileBuffer)
    const cacheKey = CacheKeys.transcription(contentHash)
    
    // Check cache (se non skip)
    if (!skipCache) {
      const cached = await cache.get(cacheKey)
      if (cached) {
        log.info('Cache hit for document', { fileName, hash: contentHash })
        onProgress(100, 'Recuperato da cache')
        
        // Pulisci file temporaneo
        try { await unlink(filePath) } catch (e) {}
        
        return cached
      }
    }
    
    const isPdf = fileName.toLowerCase().endsWith('.pdf')
    const isWord = fileName.toLowerCase().endsWith('.docx') || fileName.toLowerCase().endsWith('.doc')
    
    let result
    
    if (isPdf) {
      result = await processPDF(fileBuffer, fileName, onProgress)
    } else if (isWord) {
      result = await processWord(fileBuffer, fileName, onProgress)
    } else {
      throw new Error(`Formato file non supportato: ${fileName}`)
    }
    
    // Salva in cache
    await cache.set(cacheKey, result, CACHE_TTL)
    log.info('Document cached', { fileName, hash: contentHash })
    
    // Pulisci file temporaneo
    try {
      await unlink(filePath)
    } catch (e) {
      log.warn('Could not delete temp file', { filePath })
    }
    
    onProgress(100, 'Completato')
    return result
    
  } catch (error) {
    log.error(`Error processing document`, { fileName, error: error.message })
    throw error
  }
}

/**
 * Processa PDF - estrae testo o usa OCR se scansionato
 */
async function processPDF(buffer, fileName, onProgress) {
  onProgress(10, 'Analisi PDF...')
  
  try {
    // Prima prova estrazione testo nativa con pdf-parse
    const pdfData = await pdfParse(buffer)
    const text = pdfData.text?.trim() || ''
    const pageCount = pdfData.numpages || 1
    
    // Calcola densità caratteri per pagina
    const avgCharsPerPage = text.length / pageCount
    
    onProgress(30, `Estratte ${pageCount} pagine, ${Math.round(text.length / 1000)}k caratteri`)
    
    // Se ha abbastanza testo, è un PDF nativo
    if (avgCharsPerPage > 100 && text.length > 200) {
      onProgress(50, 'PDF nativo rilevato - formattazione...')
      
      // Verifica se serve formattazione AI
      const needsFormatting = hasFormattingIssues(text)
      
      if (!needsFormatting) {
        onProgress(90, 'Testo ben formattato - completamento...')
        return {
          text: text,
          pageCount,
          isScanned: false,
          method: 'native'
        }
      }
      
      // Formatta con AI (modello veloce)
      onProgress(60, 'Ottimizzazione formattazione...')
      const formattedText = await formatTextWithAI(text, fileName, (p) => {
        onProgress(60 + p * 0.3, 'Formattazione in corso...')
      })
      
      return {
        text: formattedText,
        pageCount,
        isScanned: false,
        method: 'native+format'
      }
    }
    
    // PDF scansionato - serve OCR
    onProgress(35, 'PDF scansionato rilevato - avvio OCR...')
    return await performPDFOcr(buffer, fileName, pageCount, onProgress)
    
  } catch (error) {
    console.error('PDF parse error, trying OCR:', error.message)
    onProgress(30, 'Estrazione fallita - avvio OCR...')
    return await performPDFOcr(buffer, fileName, 0, onProgress)
  }
}

/**
 * OCR per PDF scansionati - usa canvas nativo
 */
async function performPDFOcr(buffer, fileName, pageCount, onProgress) {
  onProgress(40, 'Conversione pagine in immagini...')
  
  // Converti PDF in immagini usando pdfjs + canvas nativo
  const images = await convertPDFToImages(buffer, (page, total) => {
    const progress = 40 + (page / total) * 20
    onProgress(progress, `Conversione pagina ${page}/${total}...`)
  })
  
  if (!images || images.length === 0) {
    throw new Error('Impossibile convertire PDF in immagini')
  }
  
  onProgress(60, `OCR su ${images.length} pagine...`)
  
  // Esegui OCR
  const ocrText = await performOCR(images, fileName, (progress, message) => {
    onProgress(60 + progress * 0.35, message)
  })
  
  return {
    text: ocrText,
    pageCount: images.length,
    isScanned: true,
    method: 'ocr'
  }
}

/**
 * Processa documenti Word
 */
async function processWord(buffer, fileName, onProgress) {
  onProgress(20, 'Estrazione testo da Word...')
  
  const mammoth = await import('mammoth')
  
  try {
    const result = await mammoth.extractRawText({ buffer })
    const text = result.value?.trim() || ''
    
    if (!text || text.length < 50) {
      throw new Error('Documento Word vuoto o non leggibile')
    }
    
    onProgress(60, 'Formattazione testo...')
    
    // Formatta se necessario
    if (hasFormattingIssues(text)) {
      const formattedText = await formatTextWithAI(text, fileName, (p) => {
        onProgress(60 + p * 0.35, 'Formattazione in corso...')
      })
      return { text: formattedText, pageCount: 1, isScanned: false, method: 'word+format' }
    }
    
    return { text, pageCount: 1, isScanned: false, method: 'word' }
    
  } catch (error) {
    throw new Error(`Impossibile elaborare documento Word: ${error.message}`)
  }
}

/**
 * Converte PDF in array di immagini base64 usando pdfjs-dist + node-canvas
 */
async function convertPDFToImages(buffer, onProgress = () => {}) {
  // Converti Buffer in Uint8Array
  const uint8Array = new Uint8Array(buffer)
  
  // Carica il documento PDF
  const loadingTask = pdfjsLib.getDocument({
    data: uint8Array,
    useSystemFonts: true,
    disableFontFace: true,
  })
  
  const pdf = await loadingTask.promise
  const totalPages = pdf.numPages
  const maxPages = Math.min(totalPages, 50)
  
  const images = []
  const scale = 1.5 // Buon compromesso qualità/velocità
  
  // Processa le pagine in sequenza (più stabile in Node.js)
  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    try {
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale })
      
      // Crea canvas con node-canvas
      const canvas = createCanvas(viewport.width, viewport.height)
      const context = canvas.getContext('2d')
      
      // Renderizza la pagina
      await page.render({
        canvasContext: context,
        viewport: viewport,
      }).promise
      
      // Converti in base64 JPEG
      const dataUrl = canvas.toDataURL('image/jpeg', 0.75)
      images.push(dataUrl.split(',')[1])
      
      onProgress(pageNum, maxPages)
      
    } catch (e) {
      console.warn(`Errore pagina ${pageNum}:`, e.message)
      // Continua con le altre pagine
    }
  }
  
  return images
}

/**
 * Verifica se il testo ha problemi di formattazione
 */
function hasFormattingIssues(text) {
  const issues = [
    text.includes('\\n'),
    /\s{5,}/.test(text),
    /[A-Z]{20,}/.test(text),
    text.split('\n').some(l => l.length > 200),
  ]
  
  return issues.some(Boolean)
}

/**
 * Formatta testo con AI (modello veloce)
 */
async function formatTextWithAI(text, fileName, onProgress = () => {}) {
  const systemPrompt = `Sei un formattatore di testo specializzato in documenti medici e legali.

COMPITO:
Ricevi testo grezzo estratto da un documento e lo formatti in modo leggibile.

REGOLE:
1. Mantieni TUTTO il contenuto originale - non riassumere
2. Correggi formattazione: paragrafi, elenchi, tabelle
3. Sistema spazi e a-capo
4. NON aggiungere commenti o interpretazioni
5. Output: solo il testo formattato`

  const result = await callOpenAI({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Documento: ${fileName}\n\nTesto da formattare:\n\n${text}` }
    ],
    model: 'gpt-4o-mini',
    maxTokens: 16000,
    onProgress
  })
  
  return result
}

export function getJobStatus(jobId) {
  return null
}

export function cancelJob(jobId) {
  return false
}
