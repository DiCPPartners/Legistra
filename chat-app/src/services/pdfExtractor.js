/**
 * Servizio per estrazione testo da PDF
 * Usa pdf.js per PDF nativi (testo selezionabile)
 * Rileva PDF scansionati che necessitano OCR
 */

import * as pdfjsLib from 'pdfjs-dist'

// Configura il worker di PDF.js
// Usa CDN ufficiale Mozilla (più affidabile di cdnjs)
// Versione: usa sempre la versione corrispondente al pacchetto installato
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

// Alternativa: se unpkg non è disponibile, fallback a CDN ufficiale Mozilla
// pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

/**
 * Estrae testo da un file PDF
 * @param {File} file - File PDF da processare
 * @param {Function} onProgress - Callback per aggiornamento progresso (0-100)
 * @returns {Promise<{text: string, pageCount: number, isScanned: boolean, extractionMethod: string}>}
 */
export async function extractTextFromPDF(file, onProgress = () => {}) {
  try {
    // Leggi il file come ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    
    // Carica il documento PDF
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const pageCount = pdf.numPages
    
    let fullText = ''
    let totalChars = 0
    let emptyPages = 0
    
    // Estrai testo da ogni pagina
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const textContent = await page.getTextContent()
      
      // Combina tutti i pezzi di testo della pagina
      const pageText = textContent.items
        .map(item => item.str)
        .join(' ')
        .trim()
      
      if (pageText.length < 10) {
        emptyPages++
      }
      
      totalChars += pageText.length
      
      // Aggiungi intestazione pagina se c'è contenuto
      if (pageText) {
        fullText += `\n\n--- Pagina ${pageNum} ---\n\n${pageText}`
      }
      
      // Aggiorna progresso
      onProgress(Math.round((pageNum / pageCount) * 100))
    }
    
    // Determina se il PDF è probabilmente scansionato
    // (poco testo estratto rispetto al numero di pagine)
    const avgCharsPerPage = totalChars / pageCount
    const isScanned = avgCharsPerPage < 100 || emptyPages > pageCount * 0.5
    
    return {
      text: fullText.trim(),
      pageCount,
      isScanned,
      extractionMethod: isScanned ? 'ocr_required' : 'native',
      avgCharsPerPage: Math.round(avgCharsPerPage),
      emptyPages,
    }
  } catch (error) {
    console.error('Errore estrazione PDF:', error)
    throw new Error(`Impossibile estrarre testo dal PDF: ${error.message}`)
  }
}

/**
 * Estrae testo da multipli file PDF in sequenza
 * @param {File[]} files - Array di file PDF
 * @param {Function} onProgress - Callback per progresso (fileIndex, progress, fileName)
 * @returns {Promise<{results: Array, combinedText: string, totalPages: number, hasScannedFiles: boolean}>}
 */
export async function extractTextFromMultiplePDFs(files, onProgress = () => {}) {
  const results = []
  let combinedText = ''
  let totalPages = 0
  let hasScannedFiles = false
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const fileName = file.name || `Documento ${i + 1}`
    
    try {
      onProgress(i, 0, fileName, 'extracting')
      
      const result = await extractTextFromPDF(file, (progress) => {
        onProgress(i, progress, fileName, 'extracting')
      })
      
      results.push({
        fileName,
        ...result,
        success: true,
      })
      
      totalPages += result.pageCount
      
      if (result.isScanned) {
        hasScannedFiles = true
      }
      
      // Combina testo con intestazione file
      if (result.text) {
        combinedText += `\n\n${'═'.repeat(60)}\n📄 DOCUMENTO: ${fileName} (${result.pageCount} pagine)\n${'═'.repeat(60)}\n${result.text}`
      }
      
      onProgress(i, 100, fileName, 'completed')
    } catch (error) {
      console.error(`Errore estrazione ${fileName}:`, error)
      results.push({
        fileName,
        text: '',
        pageCount: 0,
        isScanned: true,
        error: error.message,
        success: false,
      })
      onProgress(i, 100, fileName, 'error')
    }
  }
  
  return {
    results,
    combinedText: combinedText.trim(),
    totalPages,
    hasScannedFiles,
    successCount: results.filter(r => r.success).length,
    errorCount: results.filter(r => !r.success).length,
  }
}

/**
 * Verifica se un file è un PDF valido
 * @param {File} file 
 * @returns {boolean}
 */
export function isValidPDF(file) {
  if (!file) return false
  return file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')
}

/**
 * Stima il tempo di processamento in base alle pagine
 * @param {number} pageCount 
 * @returns {string}
 */
export function estimateProcessingTime(pageCount) {
  if (pageCount <= 10) return '~10 secondi'
  if (pageCount <= 50) return '~30 secondi'
  if (pageCount <= 100) return '~1 minuto'
  if (pageCount <= 200) return '~2 minuti'
  return `~${Math.ceil(pageCount / 100)} minuti`
}

/**
 * Calcola statistiche del testo estratto
 * @param {string} text 
 * @returns {{charCount: number, wordCount: number, estimatedTokens: number}}
 */
export function getTextStats(text) {
  if (!text) return { charCount: 0, wordCount: 0, estimatedTokens: 0 }
  
  const charCount = text.length
  const wordCount = text.split(/\s+/).filter(Boolean).length
  // Stima: ~4 caratteri per token in italiano
  const estimatedTokens = Math.ceil(charCount / 4)
  
  return { charCount, wordCount, estimatedTokens }
}

// ===== CONVERSIONE PDF IN IMMAGINI PER OCR =====

/**
 * Converte una pagina PDF in immagine base64
 * Usa OffscreenCanvas quando disponibile per supporto background
 * @param {PDFPageProxy} page - Pagina PDF da pdf.js
 * @param {number} scale - Scala di rendering (1.5 = buon compromesso qualità/dimensione)
 * @returns {Promise<string>} - Immagine in formato base64 (senza prefisso data:)
 */
async function renderPageToImage(page, scale = 1.2) {
  const viewport = page.getViewport({ scale })
  
  let canvas
  let context
  let useOffscreen = false
  
  // Prova a usare OffscreenCanvas (funziona in background)
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      canvas = new OffscreenCanvas(viewport.width, viewport.height)
      context = canvas.getContext('2d')
      useOffscreen = true
    } catch (e) {
      // Fallback a canvas normale
      canvas = document.createElement('canvas')
      context = canvas.getContext('2d')
      canvas.height = viewport.height
      canvas.width = viewport.width
    }
  } else {
    // Browser senza OffscreenCanvas
    canvas = document.createElement('canvas')
    context = canvas.getContext('2d')
    canvas.height = viewport.height
    canvas.width = viewport.width
  }
  
  // Renderizza la pagina sul canvas
  await page.render({
    canvasContext: context,
    viewport: viewport,
  }).promise
  
  // Converti in base64 (JPEG per dimensioni ridotte)
  if (useOffscreen) {
    // OffscreenCanvas usa convertToBlob
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.70 })
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } else {
    // Canvas normale usa toDataURL
    const dataUrl = canvas.toDataURL('image/jpeg', 0.70)
    return dataUrl.split(',')[1]
  }
}

/**
 * Converte un PDF in array di immagini base64 (per OCR con Gemini Vision)
 * @param {File} file - File PDF da processare
 * @param {Object} options - Opzioni
 * @param {number} options.scale - Scala di rendering (default: 1.5)
 * @param {number} options.maxPages - Numero massimo di pagine da convertire (default: 50)
 * @param {Function} options.onProgress - Callback per progresso (pageNum, totalPages)
 * @returns {Promise<{images: string[], pageCount: number, skippedPages: number}>}
 */
export async function convertPDFToImages(file, options = {}) {
  const { scale = 1.2, maxPages = 50, onProgress = () => {} } = options
  
  try {
    // Leggi il file come ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    
    // Carica il documento PDF
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const totalPages = pdf.numPages
    const pagesToConvert = Math.min(totalPages, maxPages)
    
    // Processa le pagine IN PARALLELO per completare prima che l'utente cambi tab
    // Questo è molto più veloce del processamento sequenziale
    const PARALLEL_PAGES = 8 // Processa 8 pagine alla volta per massima velocità
    const images = new Array(pagesToConvert).fill(null)
    let completedPages = 0
    
    // Funzione per processare una singola pagina
    const processPage = async (pageNum) => {
      try {
        const page = await pdf.getPage(pageNum)
        const imageBase64 = await renderPageToImage(page, scale)
        images[pageNum - 1] = imageBase64
        completedPages++
        onProgress(completedPages, totalPages)
        return true
      } catch (e) {
        console.warn(`Errore pagina ${pageNum}:`, e.message)
        // In caso di errore, riprova una volta
        try {
          const page = await pdf.getPage(pageNum)
          const imageBase64 = await renderPageToImage(page, scale)
          images[pageNum - 1] = imageBase64
          completedPages++
          onProgress(completedPages, totalPages)
          return true
        } catch (e2) {
          console.error(`Fallimento pagina ${pageNum}:`, e2.message)
          images[pageNum - 1] = null // Segna come fallita
          completedPages++
          onProgress(completedPages, totalPages)
          return false
        }
      }
    }
    
    // Processa in batch paralleli
    for (let i = 0; i < pagesToConvert; i += PARALLEL_PAGES) {
      const batch = []
      for (let j = i; j < Math.min(i + PARALLEL_PAGES, pagesToConvert); j++) {
        batch.push(processPage(j + 1))
      }
      await Promise.all(batch)
    }
    
    // Filtra le pagine fallite
    const validImages = images.filter(img => img !== null)
    
    if (validImages.length === 0) {
      throw new Error('Nessuna pagina convertita con successo')
    }
    
    return {
      images: validImages,
      pageCount: totalPages,
      convertedPages: validImages.length,
      skippedPages: Math.max(0, totalPages - maxPages) + (pagesToConvert - validImages.length),
    }
  } catch (error) {
    console.error('Errore conversione PDF in immagini:', error)
    throw new Error(`Impossibile convertire PDF in immagini: ${error.message}`)
  }
}

/**
 * Converte un file immagine in base64
 * @param {File} file - File immagine (JPG, PNG, etc.)
 * @returns {Promise<{base64: string, mimeType: string}>}
 */
export async function imageFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      const base64 = dataUrl.split(',')[1]
      const mimeType = file.type || 'image/jpeg'
      resolve({ base64, mimeType })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
