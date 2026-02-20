/**
 * Servizio per estrazione testo e stili da file Word (.docx, .doc)
 * Usa mammoth per .docx (formato moderno)
 * Per .doc (formato vecchio) usa fallback a OCR se necessario
 */

import mammoth from 'mammoth'
import JSZip from 'jszip'

/**
 * Estrae testo da un file Word (.docx)
 * @param {File} file - File Word da processare
 * @param {Function} onProgress - Callback per aggiornamento progresso (0-100)
 * @returns {Promise<{text: string, pageCount: number, isScanned: boolean, extractionMethod: string}>}
 */
export async function extractTextFromWord(file, onProgress = () => {}) {
  try {
    const fileName = file.name || 'Documento'
    const fileExtension = fileName.toLowerCase().split('.').pop()
    
    // Verifica formato supportato
    if (fileExtension !== 'docx' && fileExtension !== 'doc') {
      throw new Error(`Formato file non supportato: ${fileExtension}. Supportati: .docx, .doc`)
    }
    
    onProgress(10)
    
    // Leggi il file come ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    onProgress(30)
    
    let fullText = ''
    let pageCount = 1
    
    if (fileExtension === 'docx') {
      // Usa mammoth per .docx (formato moderno, XML-based)
      onProgress(50)
      
      const result = await mammoth.extractRawText({ arrayBuffer })
      fullText = result.value
      
      // Stima numero pagine (circa 500 parole per pagina)
      const wordCount = fullText.split(/\s+/).filter(Boolean).length
      pageCount = Math.max(1, Math.ceil(wordCount / 500))
      
      onProgress(100)
      
      // I file Word nativi non sono "scansionati" (hanno testo selezionabile)
      return {
        text: fullText.trim(),
        pageCount,
        isScanned: false,
        extractionMethod: 'native',
        avgCharsPerPage: Math.round(fullText.length / pageCount),
        emptyPages: 0,
      }
    } else {
      // .doc (formato vecchio) - mammoth potrebbe non funzionare bene
      // Prova comunque, altrimenti sarà necessario OCR
      onProgress(50)
      
      try {
        const result = await mammoth.extractRawText({ arrayBuffer })
        fullText = result.value
        
        if (fullText.trim().length < 100) {
          // Poco testo estratto, probabilmente scansionato o formato non supportato
          throw new Error('File .doc potrebbe essere scansionato o in formato non supportato. Usa OCR.')
        }
        
        const wordCount = fullText.split(/\s+/).filter(Boolean).length
        pageCount = Math.max(1, Math.ceil(wordCount / 500))
        
        onProgress(100)
        
        return {
          text: fullText.trim(),
          pageCount,
          isScanned: false,
          extractionMethod: 'native',
          avgCharsPerPage: Math.round(fullText.length / pageCount),
          emptyPages: 0,
        }
      } catch (error) {
        // Se mammoth fallisce con .doc, probabilmente è scansionato o formato non supportato
        console.warn('Errore estrazione .doc con mammoth:', error)
        throw new Error('File .doc non può essere elaborato direttamente. Il file potrebbe essere scansionato o in formato non supportato. Usa OCR per elaborarlo.')
      }
    }
  } catch (error) {
    console.error('Errore estrazione Word:', error)
    throw new Error(`Impossibile estrarre testo dal file Word: ${error.message}`)
  }
}

/**
 * Estrae testo da multipli file Word in sequenza
 * @param {File[]} files - Array di file Word
 * @param {Function} onProgress - Callback per progresso (fileIndex, progress, fileName)
 * @returns {Promise<{results: Array, combinedText: string, totalPages: number, hasScannedFiles: boolean}>}
 */
export async function extractTextFromMultipleWordFiles(files, onProgress = () => {}) {
  const results = []
  let combinedText = ''
  let totalPages = 0
  let hasScannedFiles = false
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const fileName = file.name || `Documento ${i + 1}`
    
    try {
      onProgress(i, 0, fileName, 'extracting')
      
      const result = await extractTextFromWord(file, (progress) => {
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
 * Verifica se un file è un Word valido
 * @param {File} file 
 * @returns {boolean}
 */
export function isValidWordFile(file) {
  if (!file) return false
  const fileName = file.name?.toLowerCase() || ''
  const mimeType = file.type?.toLowerCase() || ''
  
  // Supporta .docx e .doc
  return (
    fileName.endsWith('.docx') ||
    fileName.endsWith('.doc') ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  )
}

/**
 * Stima il tempo di processamento in base alle pagine
 * @param {number} pageCount 
 * @returns {string}
 */
export function estimateProcessingTime(pageCount) {
  if (pageCount <= 10) return '~5 secondi'
  if (pageCount <= 50) return '~15 secondi'
  if (pageCount <= 100) return '~30 secondi'
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

// ===== ESTRAZIONE STILI DA WORD =====

/**
 * Estrae gli stili di formattazione da un file Word (.docx)
 * Legge direttamente i file XML interni del DOCX per estrarre:
 * - Font principale
 * - Dimensioni font (titoli, corpo)
 * - Margini pagina
 * - Spaziatura righe e paragrafi
 * - Colori
 * 
 * @param {File} file - File Word da analizzare
 * @returns {Promise<Object>} Oggetto con gli stili estratti
 */
export async function extractStylesFromWord(file) {
  try {
    const fileName = file.name || 'Documento'
    const fileExtension = fileName.toLowerCase().split('.').pop()
    
    if (fileExtension !== 'docx') {
      console.warn('Estrazione stili supportata solo per .docx')
      return getDefaultStyles()
    }
    
    const arrayBuffer = await file.arrayBuffer()
    const zip = await JSZip.loadAsync(arrayBuffer)
    
    const styles = {
      // Font
      fontFamily: 'Times New Roman',
      fontFamilyHeading: 'Times New Roman',
      
      // Dimensioni font (in punti)
      fontSizeBody: 12,
      fontSizeHeading1: 16,
      fontSizeHeading2: 14,
      fontSizeHeading3: 13,
      fontSizeSmall: 10,
      
      // Margini pagina (in mm)
      marginTop: 25,
      marginBottom: 25,
      marginLeft: 25,
      marginRight: 25,
      
      // Spaziatura
      lineSpacing: 1.15, // Interlinea
      paragraphSpacingBefore: 0, // Spazio prima paragrafo (pt)
      paragraphSpacingAfter: 8, // Spazio dopo paragrafo (pt)
      
      // Colori
      colorPrimary: '000000', // Nero
      colorHeading: '000000',
      colorMuted: '666666',
      
      // Allineamento predefinito
      alignment: 'left', // left, center, right, justify
      
      // Metadati estrazione
      extractedFrom: fileName,
      extractedAt: new Date().toISOString(),
    }
    
    // Leggi styles.xml per i font e dimensioni
    const stylesXml = await zip.file('word/styles.xml')?.async('string')
    if (stylesXml) {
      parseStylesXml(stylesXml, styles)
    }
    
    // Leggi document.xml per analizzare formattazione effettiva
    const documentXml = await zip.file('word/document.xml')?.async('string')
    if (documentXml) {
      parseDocumentXml(documentXml, styles)
    }
    
    // Leggi settings.xml per margini e impostazioni pagina
    const settingsXml = await zip.file('word/settings.xml')?.async('string')
    if (settingsXml) {
      parseSettingsXml(settingsXml, styles)
    }
    
    console.log('📐 Stili estratti da Word:', styles)
    return styles
    
  } catch (error) {
    console.error('Errore estrazione stili Word:', error)
    return getDefaultStyles()
  }
}

/**
 * Restituisce stili predefiniti se l'estrazione fallisce
 */
function getDefaultStyles() {
  return {
    fontFamily: 'Times New Roman',
    fontFamilyHeading: 'Times New Roman',
    fontSizeBody: 12,
    fontSizeHeading1: 16,
    fontSizeHeading2: 14,
    fontSizeHeading3: 13,
    fontSizeSmall: 10,
    marginTop: 25,
    marginBottom: 25,
    marginLeft: 25,
    marginRight: 25,
    lineSpacing: 1.15,
    paragraphSpacingBefore: 0,
    paragraphSpacingAfter: 8,
    colorPrimary: '000000',
    colorHeading: '000000',
    colorMuted: '666666',
    alignment: 'left',
    extractedFrom: 'default',
    extractedAt: new Date().toISOString(),
  }
}

/**
 * Parse styles.xml per estrarre definizioni stili
 */
function parseStylesXml(xml, styles) {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'text/xml')
    
    // Namespace Word
    const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    
    // Cerca font predefiniti
    const defaultFonts = doc.getElementsByTagNameNS(ns, 'rFonts')
    if (defaultFonts.length > 0) {
      const ascii = defaultFonts[0].getAttribute('w:ascii') || 
                    defaultFonts[0].getAttributeNS(ns, 'ascii')
      if (ascii) {
        styles.fontFamily = ascii
        styles.fontFamilyHeading = ascii
      }
    }
    
    // Cerca stili specifici
    const styleElements = doc.getElementsByTagNameNS(ns, 'style')
    for (const styleEl of styleElements) {
      const styleId = styleEl.getAttribute('w:styleId') || ''
      const styleName = styleEl.getElementsByTagNameNS(ns, 'name')[0]?.getAttribute('w:val') || ''
      
      // Dimensione font per questo stile
      const szEl = styleEl.getElementsByTagNameNS(ns, 'sz')[0]
      const sizeVal = szEl?.getAttribute('w:val')
      if (sizeVal) {
        const sizeInPt = parseInt(sizeVal) / 2 // Word usa mezzi punti
        
        if (styleName.toLowerCase().includes('heading 1') || styleId === 'Heading1') {
          styles.fontSizeHeading1 = sizeInPt
        } else if (styleName.toLowerCase().includes('heading 2') || styleId === 'Heading2') {
          styles.fontSizeHeading2 = sizeInPt
        } else if (styleName.toLowerCase().includes('heading 3') || styleId === 'Heading3') {
          styles.fontSizeHeading3 = sizeInPt
        } else if (styleName.toLowerCase().includes('normal') || styleId === 'Normal') {
          styles.fontSizeBody = sizeInPt
        }
      }
      
      // Font per heading
      const rFontsEl = styleEl.getElementsByTagNameNS(ns, 'rFonts')[0]
      if (rFontsEl && (styleName.toLowerCase().includes('heading') || styleId.includes('Heading'))) {
        const headingFont = rFontsEl.getAttribute('w:ascii') || 
                           rFontsEl.getAttributeNS(ns, 'ascii')
        if (headingFont) {
          styles.fontFamilyHeading = headingFont
        }
      }
      
      // Colore
      const colorEl = styleEl.getElementsByTagNameNS(ns, 'color')[0]
      const colorVal = colorEl?.getAttribute('w:val')
      if (colorVal && colorVal !== 'auto') {
        if (styleName.toLowerCase().includes('heading')) {
          styles.colorHeading = colorVal
        } else if (styleName.toLowerCase().includes('normal')) {
          styles.colorPrimary = colorVal
        }
      }
    }
    
    // Cerca spaziatura predefinita
    const spacingElements = doc.getElementsByTagNameNS(ns, 'spacing')
    for (const spacingEl of spacingElements) {
      // Line spacing
      const lineVal = spacingEl.getAttribute('w:line')
      if (lineVal) {
        // 240 = single spacing, 360 = 1.5, 480 = double
        styles.lineSpacing = parseInt(lineVal) / 240
      }
      
      // Paragraph spacing
      const beforeVal = spacingEl.getAttribute('w:before')
      if (beforeVal) {
        styles.paragraphSpacingBefore = parseInt(beforeVal) / 20 // twips to pt
      }
      
      const afterVal = spacingEl.getAttribute('w:after')
      if (afterVal) {
        styles.paragraphSpacingAfter = parseInt(afterVal) / 20 // twips to pt
      }
    }
    
  } catch (error) {
    console.warn('Errore parsing styles.xml:', error)
  }
}

/**
 * Parse document.xml per analizzare formattazione effettiva del contenuto
 */
function parseDocumentXml(xml, styles) {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'text/xml')
    const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    
    // Analizza i primi paragrafi per determinare stile predominante
    const paragraphs = doc.getElementsByTagNameNS(ns, 'p')
    const fontSizes = []
    const fonts = []
    
    for (let i = 0; i < Math.min(paragraphs.length, 20); i++) {
      const p = paragraphs[i]
      
      // Font size
      const szElements = p.getElementsByTagNameNS(ns, 'sz')
      for (const sz of szElements) {
        const val = sz.getAttribute('w:val')
        if (val) fontSizes.push(parseInt(val) / 2)
      }
      
      // Font family
      const rFontsElements = p.getElementsByTagNameNS(ns, 'rFonts')
      for (const rf of rFontsElements) {
        const ascii = rf.getAttribute('w:ascii')
        if (ascii) fonts.push(ascii)
      }
      
      // Alignment
      const jcEl = p.getElementsByTagNameNS(ns, 'jc')[0]
      if (jcEl && i < 5) { // Primi paragrafi
        const jcVal = jcEl.getAttribute('w:val')
        if (jcVal) {
          styles.alignment = jcVal === 'both' ? 'justify' : jcVal
        }
      }
    }
    
    // Usa il font size più comune come body
    if (fontSizes.length > 0) {
      const sizeFreq = {}
      fontSizes.forEach(s => sizeFreq[s] = (sizeFreq[s] || 0) + 1)
      const mostCommonSize = Object.keys(sizeFreq).reduce((a, b) => 
        sizeFreq[a] > sizeFreq[b] ? a : b
      )
      styles.fontSizeBody = parseFloat(mostCommonSize)
    }
    
    // Usa il font più comune
    if (fonts.length > 0) {
      const fontFreq = {}
      fonts.forEach(f => fontFreq[f] = (fontFreq[f] || 0) + 1)
      const mostCommonFont = Object.keys(fontFreq).reduce((a, b) => 
        fontFreq[a] > fontFreq[b] ? a : b
      )
      styles.fontFamily = mostCommonFont
    }
    
    // Cerca sectPr per margini pagina
    const sectPr = doc.getElementsByTagNameNS(ns, 'sectPr')[0]
    if (sectPr) {
      const pgMar = sectPr.getElementsByTagNameNS(ns, 'pgMar')[0]
      if (pgMar) {
        // Valori in twips (1/20 di punto, 1/1440 di pollice)
        // Convertiamo in mm (1 pollice = 25.4mm)
        const twipsToMm = (twips) => Math.round((parseInt(twips) / 1440) * 25.4)
        
        const top = pgMar.getAttribute('w:top')
        const bottom = pgMar.getAttribute('w:bottom')
        const left = pgMar.getAttribute('w:left')
        const right = pgMar.getAttribute('w:right')
        
        if (top) styles.marginTop = twipsToMm(top)
        if (bottom) styles.marginBottom = twipsToMm(bottom)
        if (left) styles.marginLeft = twipsToMm(left)
        if (right) styles.marginRight = twipsToMm(right)
      }
    }
    
  } catch (error) {
    console.warn('Errore parsing document.xml:', error)
  }
}

/**
 * Parse settings.xml per impostazioni aggiuntive
 */
function parseSettingsXml(xml, styles) {
  // Per ora non estraiamo nulla da settings.xml
  // Potremmo aggiungere in futuro: zoom, protezione, etc.
}

export { getDefaultStyles }
