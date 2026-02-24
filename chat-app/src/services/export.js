/**
 * Servizio per esportazione documenti in PDF e Word
 */

import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, convertMillimetersToTwip } from 'docx'
import { saveAs } from 'file-saver'

// ===== CONFIGURAZIONE PREDEFINITA =====
const PDF_CONFIG_DEFAULT = {
  pageWidth: 210,
  pageHeight: 297,
  margin: 20,
  lineHeight: 7,
  fontSize: {
    title: 18,
    subtitle: 14,
    heading: 12,
    body: 10,
    small: 8
  },
  colors: {
    primary: [123, 31, 52], // #7B1F34
    dark: [30, 41, 59],      // slate-800
    muted: [100, 116, 139]   // slate-500
  },
  fontFamily: 'helvetica'
}

const WORD_CONFIG_DEFAULT = {
  fontSize: {
    title: 32,
    heading1: 28,
    heading2: 24,
    body: 22,
    small: 18
  },
  fontFamily: 'Times New Roman',
  lineSpacing: 1.15,
  paragraphSpacingAfter: 200 // In twips (1/20 di punto)
}

/**
 * Costruisce configurazione PDF dagli stili estratti dal template
 * @param {Object} customStyles - Stili estratti da extractStylesFromWord
 * @returns {Object} Configurazione PDF personalizzata
 */
function buildPdfConfig(customStyles) {
  if (!customStyles || !customStyles.fontFamily) {
    return PDF_CONFIG_DEFAULT
  }
  
  // Converti colore hex in RGB
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result 
      ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
      : [0, 0, 0]
  }
  
  return {
    pageWidth: 210,
    pageHeight: 297,
    margin: Math.max(15, Math.min(40, customStyles.marginLeft || 20)), // Limita tra 15-40mm
    lineHeight: customStyles.lineSpacing ? customStyles.lineSpacing * 5 : 7,
    fontSize: {
      title: customStyles.fontSizeHeading1 || 18,
      subtitle: customStyles.fontSizeHeading2 || 14,
      heading: customStyles.fontSizeHeading3 || 12,
      body: customStyles.fontSizeBody || 10,
      small: customStyles.fontSizeSmall || 8
    },
    colors: {
      primary: hexToRgb(customStyles.colorPrimary || '000000'),
      dark: hexToRgb(customStyles.colorHeading || '1e293b'),
      muted: hexToRgb(customStyles.colorMuted || '64748b')
    },
    fontFamily: mapFontToPdf(customStyles.fontFamily),
    alignment: customStyles.alignment || 'left'
  }
}

/**
 * Costruisce configurazione Word dagli stili estratti
 * @param {Object} customStyles - Stili estratti
 * @returns {Object} Configurazione Word personalizzata
 */
function buildWordConfig(customStyles) {
  if (!customStyles || !customStyles.fontFamily) {
    return WORD_CONFIG_DEFAULT
  }
  
  // Word usa half-points (1pt = 2 half-points)
  const ptToHalfPt = (pt) => pt * 2
  
  return {
    fontSize: {
      title: ptToHalfPt(customStyles.fontSizeHeading1 || 16),
      heading1: ptToHalfPt(customStyles.fontSizeHeading1 || 16),
      heading2: ptToHalfPt(customStyles.fontSizeHeading2 || 14),
      body: ptToHalfPt(customStyles.fontSizeBody || 12),
      small: ptToHalfPt(customStyles.fontSizeSmall || 10)
    },
    fontFamily: customStyles.fontFamily,
    fontFamilyHeading: customStyles.fontFamilyHeading || customStyles.fontFamily,
    lineSpacing: customStyles.lineSpacing || 1.15,
    paragraphSpacingAfter: (customStyles.paragraphSpacingAfter || 8) * 20, // pt to twips
    colorPrimary: customStyles.colorPrimary || '000000',
    colorHeading: customStyles.colorHeading || '000000',
    alignment: customStyles.alignment || 'left'
  }
}

/**
 * Mappa font name a font disponibili in jsPDF
 * jsPDF supporta: helvetica, courier, times
 */
function mapFontToPdf(fontName) {
  if (!fontName) return 'helvetica'
  const lower = fontName.toLowerCase()
  
  if (lower.includes('times') || lower.includes('serif')) return 'times'
  if (lower.includes('courier') || lower.includes('mono')) return 'courier'
  return 'helvetica' // Arial, Calibri, etc -> helvetica
}

/**
 * Mappa alignment a AlignmentType per docx
 */
function mapAlignmentToDocx(alignment) {
  switch (alignment) {
    case 'center': return AlignmentType.CENTER
    case 'right': return AlignmentType.RIGHT
    case 'justify': return AlignmentType.JUSTIFIED
    default: return AlignmentType.LEFT
  }
}

// Backward compatibility
const PDF_CONFIG = PDF_CONFIG_DEFAULT
const WORD_CONFIG = WORD_CONFIG_DEFAULT

// ===== UTILITY =====

/**
 * Formatta data in italiano
 */
function formatDate(date = new Date()) {
  return date.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })
}

/**
 * Pulisce testo markdown per export
 */
function cleanMarkdown(text) {
  if (!text) return ''
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')  // Rimuovi bold
    .replace(/\*(.*?)\*/g, '$1')       // Rimuovi italic
    .replace(/#{1,6}\s/g, '')          // Rimuovi headers markdown
    .replace(/`(.*?)`/g, '$1')         // Rimuovi code inline
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Link -> solo testo
    .trim()
}

/**
 * Estrae sezioni dal testo (basato su headers)
 */
function extractSections(text) {
  if (!text) return [{ title: '', content: text || '' }]
  
  const sections = []
  const lines = text.split('\n')
  let currentSection = { title: '', content: '' }
  
  for (const line of lines) {
    // Rileva headers (## Titolo o === o ---)
    const headerMatch = line.match(/^#{1,3}\s+(.+)$/)
    const dividerMatch = line.match(/^[═=─-]{3,}$/)
    
    if (headerMatch) {
      if (currentSection.content.trim()) {
        sections.push(currentSection)
      }
      currentSection = { title: headerMatch[1].trim(), content: '' }
    } else if (dividerMatch && currentSection.content.trim()) {
      // Ignora dividers
    } else {
      currentSection.content += line + '\n'
    }
  }
  
  if (currentSection.content.trim() || currentSection.title) {
    sections.push(currentSection)
  }
  
  return sections.length > 0 ? sections : [{ title: '', content: text }]
}

// ===== EXPORT PDF =====

/**
 * Esporta conversazione/analisi in PDF
 * 
 * @param {Object} options - Opzioni export
 * @param {Object} options.customStyles - Stili personalizzati estratti dal template
 * @returns {Promise<Blob>} PDF blob
 */
export async function exportToPDF({
  title = 'Report Legale',
  subtitle = '',
  content,
  messages = [],
  metadata = {},
  includeHeader = true,
  includeFooter = true,
  download = true,
  filename = null,
  customStyles = null
}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })
  
  // Usa stili personalizzati se disponibili
  const config = customStyles ? buildPdfConfig(customStyles) : PDF_CONFIG_DEFAULT
  const { margin, fontSize, colors, pageWidth, fontFamily } = config
  const contentWidth = pageWidth - (margin * 2)
  let y = margin
  
  // Imposta font (se disponibile)
  if (fontFamily && fontFamily !== 'helvetica') {
    try {
      doc.setFont(fontFamily)
    } catch (e) {
      // Font non disponibile, usa default
      console.warn(`Font ${fontFamily} non disponibile, uso helvetica`)
    }
  }
  
  // === HEADER ===
  if (includeHeader) {
    // Logo/Titolo app
    doc.setFontSize(fontSize.small)
    doc.setTextColor(...colors.primary)
    doc.text('Legistra', margin, y)
    
    // Data
    doc.setTextColor(...colors.muted)
    doc.text(formatDate(), pageWidth - margin, y, { align: 'right' })
    
    y += 10
    
    // Linea separatrice
    doc.setDrawColor(...colors.primary)
    doc.setLineWidth(0.5)
    doc.line(margin, y, pageWidth - margin, y)
    
    y += 10
  }
  
  // === TITOLO ===
  doc.setFontSize(fontSize.title)
  doc.setTextColor(...colors.dark)
  doc.setFont('helvetica', 'bold')
  const titleLines = doc.splitTextToSize(title, contentWidth)
  doc.text(titleLines, margin, y)
  y += titleLines.length * 8 + 5
  
  // === SOTTOTITOLO ===
  if (subtitle) {
    doc.setFontSize(fontSize.subtitle)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...colors.muted)
    doc.text(subtitle, margin, y)
    y += 10
  }
  
  // === METADATA ===
  if (Object.keys(metadata).length > 0) {
    doc.setFontSize(fontSize.small)
    doc.setTextColor(...colors.muted)
    
    Object.entries(metadata).forEach(([key, value]) => {
      if (value) {
        doc.text(`${key}: ${value}`, margin, y)
        y += 5
      }
    })
    
    y += 5
  }
  
  // === CONTENUTO ===
  if (content) {
    const sections = extractSections(content)
    
    for (const section of sections) {
      // Check page break
      if (y > 260) {
        doc.addPage()
        y = margin
      }
      
      // Titolo sezione
      if (section.title) {
        doc.setFontSize(fontSize.heading)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...colors.dark)
        doc.text(section.title, margin, y)
        y += 8
      }
      
      // Contenuto sezione
      if (section.content.trim()) {
        doc.setFontSize(fontSize.body)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...colors.dark)
        
        const cleanContent = cleanMarkdown(section.content)
        const lines = doc.splitTextToSize(cleanContent, contentWidth)
        
        for (const line of lines) {
          if (y > 270) {
            doc.addPage()
            y = margin
          }
          doc.text(line, margin, y)
          y += 5
        }
        
        y += 5
      }
    }
  }
  
  // === MESSAGGI (se inclusi) ===
  if (messages.length > 0) {
    doc.addPage()
    y = margin
    
    doc.setFontSize(fontSize.heading)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...colors.dark)
    doc.text('Cronologia Conversazione', margin, y)
    y += 10
    
    for (const msg of messages) {
      if (y > 250) {
        doc.addPage()
        y = margin
      }
      
      // Role
      const roleLabel = msg.role === 'user' ? 'Utente' : 'Assistente'
      doc.setFontSize(fontSize.small)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...(msg.role === 'user' ? colors.muted : colors.primary))
      doc.text(roleLabel, margin, y)
      y += 5
      
      // Content
      doc.setFontSize(fontSize.body)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...colors.dark)
      
      const msgText = cleanMarkdown(msg.text || msg.content || '')
      if (msgText) {
        const lines = doc.splitTextToSize(msgText, contentWidth)
        for (const line of lines.slice(0, 20)) { // Limita a 20 righe per messaggio
          if (y > 270) {
            doc.addPage()
            y = margin
          }
          doc.text(line, margin, y)
          y += 5
        }
        if (lines.length > 20) {
          doc.text('[... contenuto troncato ...]', margin, y)
          y += 5
        }
      }
      
      y += 5
    }
  }
  
  // === FOOTER ===
  if (includeFooter) {
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(fontSize.small)
      doc.setTextColor(...colors.muted)
      doc.text(
        `Pagina ${i} di ${pageCount}`,
        pageWidth / 2,
        290,
        { align: 'center' }
      )
      doc.text(
        'Generato con Legistra - Assistente Legale AI',
        pageWidth / 2,
        295,
        { align: 'center' }
      )
    }
  }
  
  // === OUTPUT ===
  const pdfBlob = doc.output('blob')
  
  if (download) {
    const fileName = filename || `legistra_report_${Date.now()}.pdf`
    saveAs(pdfBlob, fileName)
  }
  
  return pdfBlob
}

// ===== EXPORT WORD =====

/**
 * Esporta in formato Word (docx) con impaginazione fedele al template.
 * Se customStyles contiene headerLines/signatureLines/disclaimerText (da analyzeDocumentFormatting),
 * questi vengono usati per replicare l'aspetto originale del template.
 */
export async function exportToWord({
  title = 'Report Legale',
  subtitle = '',
  content,
  messages = [],
  metadata = {},
  download = true,
  filename = null,
  customStyles = null
}) {
  const hasTemplateStyles = customStyles && customStyles.extractedFrom
  const config = hasTemplateStyles ? buildWordConfig(customStyles) : WORD_CONFIG_DEFAULT
  const { fontSize, fontFamily, lineSpacing, alignment } = config
  
  const defaultAlign = mapAlignmentToDocx(alignment)
  const bodySize = fontSize.body || 24
  const headingSize = fontSize.heading1 || 28
  const smallSize = fontSize.small || 18
  
  // Spacing: usa i valori dal template, convertiti in twips (1pt = 20 twips)
  const paraSpacingAfterPt = hasTemplateStyles ? (customStyles.paragraphSpacingAfter ?? 0) : 6
  const paraSpacingBeforePt = hasTemplateStyles ? (customStyles.paragraphSpacingBefore ?? 0) : 0
  const spacingAfter = paraSpacingAfterPt * 20
  const spacingBefore = paraSpacingBeforePt * 20
  const lineSpacingVal = Math.round((lineSpacing || 1.15) * 240)
  
  const headingBold = hasTemplateStyles ? (customStyles.headingBold !== false) : true
  const headingAllCaps = hasTemplateStyles ? !!customStyles.headingAllCaps : false
  const bodyIndent = hasTemplateStyles && customStyles.bodyIndentFirstLine ? 720 : undefined
  
  const children = []

  // === INTESTAZIONE (dal template, se presente) ===
  if (hasTemplateStyles && customStyles.headerLines?.length > 0) {
    for (const line of customStyles.headerLines) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line,
              size: smallSize,
              font: fontFamily,
            })
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 20 },
        })
      )
    }
    children.push(new Paragraph({
      border: { bottom: { color: '000000', size: 1, style: BorderStyle.SINGLE } },
      spacing: { after: 300 }
    }))
  }
  
  // === CONTENUTO PRINCIPALE ===
  if (content) {
    // Raggruppa le righe in paragrafi reali (separati da righe vuote)
    const paragraphs = groupIntoParagraphs(content)
    
    for (const para of paragraphs) {
      const cleaned = cleanMarkdown(para).trim()
      if (!cleaned) continue
      
      const isHeading = isHeadingLine(para.trim(), hasTemplateStyles ? customStyles?.sectionTitles : null)

      if (isHeading) {
        const headingText = headingAllCaps ? cleaned.toUpperCase() : cleaned
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: headingText,
                bold: headingBold,
                size: headingSize,
                font: fontFamily,
                allCaps: headingAllCaps,
              })
            ],
            spacing: { before: spacingBefore + 120, after: spacingAfter || 60, line: lineSpacingVal },
            alignment: defaultAlign,
          })
        )
      } else {
        const runs = parseInlineFormatting(cleaned, bodySize, fontFamily)
        children.push(
          new Paragraph({
            children: runs,
            spacing: { before: spacingBefore, after: spacingAfter, line: lineSpacingVal },
            alignment: defaultAlign,
            indent: bodyIndent ? { firstLine: bodyIndent } : undefined,
          })
        )
      }
    }
  }
  
  // === FIRMA (dal template, se presente) ===
  if (hasTemplateStyles && customStyles.signatureLines?.length > 0) {
    children.push(new Paragraph({ spacing: { before: 400 } }))
    for (const line of customStyles.signatureLines) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line,
              size: bodySize,
              font: fontFamily,
            })
          ],
          spacing: { after: 40 },
        })
      )
    }
  }
  
  // === DISCLAIMER (dal template, se presente) ===
  if (hasTemplateStyles && customStyles.disclaimerText) {
    children.push(new Paragraph({ spacing: { before: 400 } }))
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: customStyles.disclaimerText,
            size: smallSize,
            font: fontFamily,
            italics: true,
          })
        ],
        spacing: { after: spacingAfter, line: lineSpacingVal },
        alignment: defaultAlign,
      })
    )
  }
  
  // Se non ci sono stili template, aggiungi footer generico
  if (!hasTemplateStyles) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'Generato con Legistra',
            size: smallSize,
            color: '999999',
            italics: true,
            font: fontFamily,
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 600 }
      })
    )
  }
  
  // === MARGINI PAGINA ===
  const marginTop = hasTemplateStyles ? (customStyles.marginTop || 25) : 25
  const marginBottom = hasTemplateStyles ? (customStyles.marginBottom || 25) : 25
  const marginLeft = hasTemplateStyles ? (customStyles.marginLeft || 30) : 25
  const marginRight = hasTemplateStyles ? (customStyles.marginRight || 25) : 25
  
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertMillimetersToTwip(marginTop),
            bottom: convertMillimetersToTwip(marginBottom),
            left: convertMillimetersToTwip(marginLeft),
            right: convertMillimetersToTwip(marginRight),
          }
        }
      },
      children
    }]
  })
  
  const docBlob = await Packer.toBlob(doc)
  
  if (download) {
    const fileName = filename || `legistra_report_${Date.now()}.docx`
    saveAs(docBlob, fileName)
  }
  
  return docBlob
}

/**
 * Raggruppa righe consecutive non vuote in paragrafi.
 * Le righe vuote separano i paragrafi.
 * Le intestazioni (heading) restano paragrafi separati.
 */
function groupIntoParagraphs(text) {
  const lines = text.split('\n')
  const paragraphs = []
  let currentPara = []

  for (const line of lines) {
    const trimmed = line.trim()
    
    if (!trimmed) {
      if (currentPara.length > 0) {
        paragraphs.push(currentPara.join(' '))
        currentPara = []
      }
      continue
    }

    const heading = isHeadingLine(trimmed, null)
    
    if (heading) {
      if (currentPara.length > 0) {
        paragraphs.push(currentPara.join(' '))
        currentPara = []
      }
      paragraphs.push(trimmed)
    } else {
      currentPara.push(trimmed)
    }
  }

  if (currentPara.length > 0) {
    paragraphs.push(currentPara.join(' '))
  }

  return paragraphs
}

/**
 * Determina se una riga è un titolo/heading
 */
function isHeadingLine(line, sectionTitles) {
  if (!line) return false
  const clean = cleanMarkdown(line).trim()
  
  if (/^#{1,3}\s/.test(line)) return true
  if (/^[A-ZÀÈÉÌÒÙÂÊÎÔÛ\s:.\-]{4,}$/.test(clean) && clean.length < 80) return true
  if (/^[A-Z][A-Za-zÀ-ú\s]+:$/.test(clean)) return true
  if (/^\d+[\.\)]\s+[A-Z]/.test(clean)) return true
  if (sectionTitles?.some(t => clean.toUpperCase().includes(t.toUpperCase()))) return true
  
  return false
}

/**
 * Converte bold markdown inline (**testo**) in TextRun formattati
 */
function parseInlineFormatting(text, size, fontFamily) {
  const runs = []
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  
  for (const part of parts) {
    if (!part) continue
    const isBold = part.startsWith('**') && part.endsWith('**')
    runs.push(
      new TextRun({
        text: isBold ? part.slice(2, -2) : part,
        bold: isBold,
        size,
        font: fontFamily,
      })
    )
  }
  
  return runs.length > 0 ? runs : [new TextRun({ text, size, font: fontFamily })]
}

// ===== COPIA NEGLI APPUNTI =====

/**
 * Copia testo formattato negli appunti
 */
export async function copyToClipboard(content) {
  const text = cleanMarkdown(content)
  
  try {
    await navigator.clipboard.writeText(text)
    return { success: true }
  } catch (error) {
    // Fallback per browser più vecchi
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.left = '-9999px'
    document.body.appendChild(textArea)
    textArea.select()
    
    try {
      document.execCommand('copy')
      document.body.removeChild(textArea)
      return { success: true }
    } catch (e) {
      document.body.removeChild(textArea)
      throw new Error('Impossibile copiare negli appunti')
    }
  }
}

// ===== EXPORT MULTIPLO =====

/**
 * Esporta in formato scelto dall'utente
 */
export async function exportDocument(format, options) {
  switch (format.toLowerCase()) {
    case 'pdf':
      return exportToPDF(options)
    case 'word':
    case 'docx':
      return exportToWord(options)
    case 'clipboard':
    case 'copy':
      return copyToClipboard(options.content)
    default:
      throw new Error(`Formato non supportato: ${format}`)
  }
}

export default {
  exportToPDF,
  exportToWord,
  copyToClipboard,
  exportDocument
}
