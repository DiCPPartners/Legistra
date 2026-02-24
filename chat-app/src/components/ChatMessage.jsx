import { useEffect, useMemo, useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import ExportMenu from './ExportMenu'
import { getCategoryFormattingStyles } from '../services/templates'

/**
 * Converte righe con pipe (tabelle markdown) in testo leggibile.
 * Es: "| Doc. | Tipo | Data |" → "Doc.: Tipo, Data"
 */
const convertTableToText = (tableLines) => {
  if (!tableLines || tableLines.length === 0) return ''

  // Estrai le celle da ogni riga
  const rows = tableLines
    .filter(line => !/^[\s|:-]+$/.test(line)) // Rimuovi righe separatore (|---|---|)
    .map(line => 
      line
        .replace(/^\s*\|/, '')  // Rimuovi pipe iniziale
        .replace(/\|\s*$/, '')  // Rimuovi pipe finale
        .split('|')
        .map(cell => cell.trim())
        .filter(cell => cell.length > 0)
    )
    .filter(row => row.length > 0)

  if (rows.length === 0) return ''

  // Se c'è un header (prima riga) e dati sotto, formatta come lista descrittiva
  if (rows.length >= 2) {
    const header = rows[0]
    const dataRows = rows.slice(1)
    
    return dataRows.map(row => {
      // Abbina ogni cella al suo header
      const parts = row.map((cell, i) => {
        if (i < header.length && header[i] && cell) {
          return `**${header[i]}**: ${cell}`
        }
        return cell
      }).filter(Boolean)
      return parts.join(' – ')
    }).join('\n\n')
  }

  // Se è una sola riga, unisci le celle con separatori
  return rows.map(row => row.join(' – ')).join('\n')
}

/**
 * Pulisce il testo dell'AI prima del rendering markdown.
 * Risolve problemi di formattazione: hr spurie, trattini, pipe, a-capo rotti.
 */
const sanitizeMarkdown = (text) => {
  if (!text || typeof text !== 'string') return text

  let cleaned = text

  // 1. Normalizza i ritorni a capo Windows
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // 2. Rimuovi sequenze \n letterali (non vere newline) rimaste dalla serializzazione
  cleaned = cleaned.replace(/\\n/g, '\n')

  // 3. Evita che --- / *** / ___ a inizio riga diventino <hr>
  cleaned = cleaned.replace(/^(\s*)([-*_])\2{2,}\s*$/gm, '')

  // 4. Converti tabelle markdown (righe con pipe) in testo leggibile
  //    Raggruppa righe consecutive con pipe e convertile
  const lines = cleaned.split('\n')
  const result = []
  let tableBuffer = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const pipeCount = (line.match(/\|/g) || []).length

    if (pipeCount >= 2) {
      // Riga con almeno 2 pipe = probabile tabella
      tableBuffer.push(line)
    } else {
      // Se avevamo accumulato righe tabella, convertile
      if (tableBuffer.length > 0) {
        const converted = convertTableToText(tableBuffer)
        if (converted) result.push(converted)
        tableBuffer = []
      }
      
      // Gestisci pipe singoli nella riga (non tabella)
      if (pipeCount === 1) {
        result.push(line.replace(/\|/g, ' – '))
      } else {
        result.push(line)
      }
    }
  }
  // Svuota eventuale buffer residuo
  if (tableBuffer.length > 0) {
    const converted = convertTableToText(tableBuffer)
    if (converted) result.push(converted)
  }

  cleaned = result.join('\n')

  // 5. Riduci 3+ newline consecutive a 2 (un paragrafo di separazione)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')

  // 6. Rimuovi spazi trailing che in markdown creano <br> hard break
  cleaned = cleaned.replace(/ {2,}$/gm, '')

  // 7. Pulisci trattini a inizio riga che non sono veri elenchi puntati
  cleaned = cleaned.replace(/^-([a-zà-ú])/gm, '– $1')

  // 8. Evidenzia riferimenti normativi (art. 2043 c.c., artt. 1218-1223 c.c., etc.)
  cleaned = cleaned.replace(
    /\b((?:art(?:t)?\.?\s*\d+(?:\s*[-–]\s*\d+)?(?:\s*bis|ter|quater|quinquies|sexies)?)\s*(?:c\.c\.|c\.p\.|c\.p\.c\.|c\.p\.p\.|Cost\.|cod\.\s*civ\.|cod\.\s*pen\.|cod\.\s*proc\.\s*civ\.|cod\.\s*proc\.\s*pen\.))/gi,
    '**$1**'
  )

  return cleaned.trim()
}

const animatedMessageIds = new Set()

const TYPING_INTERVAL_MS = 18
const COPY_DELAY_MS = 200
const COPY_BUTTON_DELAY_MS = 500

const formatBytes = (bytes) => {
  if (!bytes && bytes !== 0) return ''
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`
}

const createBubbleClasses = (isUser, isEditing) => {
  const base =
    'relative rounded-2xl px-3 py-3 sm:px-5 sm:py-4 shadow-lg border transition-all backdrop-blur-sm'
  if (isEditing) {
    return `${base} bg-gradient-to-br from-white via-slate-50/90 to-white text-slate-900 border-[#7B1F34] ring-2 ring-[#7B1F34]/20`
  }
  return isUser
    ? `${base} bg-gradient-to-br from-white via-slate-50/90 to-white text-slate-900 border-slate-200/50 select-none`
    : `${base} bg-white/90 text-slate-800 border-slate-200/50 select-none`
}

const Loader = () => (
  <div className="flex items-center gap-3 text-sm text-slate-600">
    <span className="relative flex h-3 w-3">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#7B1F34]/60 opacity-75" />
      <span className="relative inline-flex h-3 w-3 rounded-full bg-[#7B1F34]" />
    </span>
    <span className="font-medium">Elaborazione in corso...</span>
  </div>
)


// Cursore lampeggiante per streaming - più visibile e moderno
const StreamingCursor = () => (
  <span className="ml-1 inline-flex items-center align-middle">
    <span className="relative flex h-2.5 w-2.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#7B1F34]/60 opacity-75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#7B1F34]" />
    </span>
  </span>
)

// Debug log helper per ChatMessage
const DEBUG_CHAT = true
const chatLog = (label, data) => {
  if (!DEBUG_CHAT) return
  console.log(`%c[ChatMessage] ${label}`, 'color: #7B1F34; font-weight: bold', data || '')
}

export default function ChatMessage({ message, conversationId, onEditMessage }) {
  const isUser = message.role === 'user'
  const isDraft = Boolean(message.isDraft)
  const isStreaming = Boolean(message.isStreaming)
  const originalText = useMemo(() => (typeof message.text === 'string' ? message.text : ''), [message.text])
  const [renderedText, setRenderedText] = useState(originalText)
  const [isTyping, setIsTyping] = useState(false)
  const [didCopy, setDidCopy] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [exportStyles, setExportStyles] = useState(null)

  // Log di debug per ogni render del messaggio
  if (DEBUG_CHAT && !isUser) {
    chatLog('RENDER', {
      id: message.id?.slice(0, 12),
      role: message.role,
      isLoading: message.isLoading,
      isStreaming,
      isTyping,
      wasStreamed: message.wasStreamed,
      animateTyping: message.animateTyping,
      textLen: originalText?.length || 0,
      renderedLen: renderedText?.length || 0,
      hasError: !!message.error,
    })
  }
  
  // Carica stili di formattazione dalla categoria se disponibile nel metadata
  useEffect(() => {
    const loadExportStyles = async () => {
      const categoryId = message.metadata?.categoryId
      if (categoryId && !isUser) {
        try {
          const styles = await getCategoryFormattingStyles(categoryId)
          if (styles) {
            setExportStyles(styles)
          }
        } catch (error) {
          console.warn('Impossibile caricare stili per export:', error)
        }
      }
    }
    loadExportStyles()
  }, [message.metadata?.categoryId, isUser])
  const [editText, setEditText] = useState(originalText)
  const [showFilesDropdown, setShowFilesDropdown] = useState(false)
  const editRef = useRef(null)
  const filesDropdownRef = useRef(null)
  const copyTimeoutRef = useRef(null)
  const prevMessageIdRef = useRef(message.id)
  const hasStructuredData = message.data && typeof message.data === 'object'
  const shouldShowBubble =
    message.isLoading || message.error || Boolean(originalText?.trim()?.length) || hasStructuredData || isTyping || isStreaming
  const canEdit = isUser && !message.isLoading && !isStreaming && !message.error && !isDraft && onEditMessage && conversationId
  const bubbleClasses = createBubbleClasses(isUser, isEditing)

  // Pulsante copia: visibile per tutti i messaggi assistente non in streaming/typing
  const showCopyButton = !isUser && !message.isLoading && !message.error && !isStreaming && !isTyping && Boolean(renderedText) && renderedText.length > 10

  // Animazione typing - solo per nuovi messaggi non streamati
  useEffect(() => {
    const shouldAnimate =
      !isUser &&
      !message.isLoading &&
      !message.error &&
      !message.wasStreamed &&
      Boolean(originalText) &&
      message.animateTyping === true &&
      !animatedMessageIds.has(message.id)

    chatLog('Animation useEffect', {
      id: message.id?.slice(0, 12),
      shouldAnimate,
      wasStreamed: message.wasStreamed,
      animateTyping: message.animateTyping,
      alreadyAnimated: animatedMessageIds.has(message.id),
      textLen: originalText?.length,
    })

    if (!shouldAnimate) {
      setRenderedText(originalText)
      setIsTyping(false)
      return
    }

    animatedMessageIds.add(message.id)
    let frame = 0
    const totalLength = originalText.length
    const step = totalLength > 1500 ? 6 : totalLength > 800 ? 4 : 2
    let completed = false

    setRenderedText(originalText.slice(0, 1))
    setIsTyping(true)
    chatLog('Animation STARTED', { id: message.id?.slice(0, 12), totalLength, step })

    const interval = setInterval(() => {
      frame = Math.min(frame + step, totalLength)
      setRenderedText(originalText.slice(0, frame))
      if (frame >= totalLength) {
        completed = true
        setIsTyping(false)
        clearInterval(interval)
      }
    }, TYPING_INTERVAL_MS)

    return () => {
      clearInterval(interval)
      if (!completed) {
        animatedMessageIds.delete(message.id)
      }
    }
  }, [isUser, message.animateTyping, message.error, message.id, message.isLoading, message.wasStreamed, originalText])

  // Reset stato quando cambia il messaggio
  useEffect(() => {
    if (prevMessageIdRef.current !== message.id) {
      chatLog('Message ID CHANGED', {
        from: prevMessageIdRef.current?.slice(0, 12),
        to: message.id?.slice(0, 12),
        role: message.role,
        textLen: originalText?.length,
      })
      prevMessageIdRef.current = message.id
      setDidCopy(false)
      setIsEditing(false)
      setEditText(originalText)
    }
  }, [message.id, originalText])

  // Sincronizza renderedText quando originalText cambia senza animazione
  useEffect(() => {
    if (!isTyping && !isStreaming) {
      setRenderedText(originalText)
    }
  }, [originalText, isTyping, isStreaming])

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus()
      const len = editRef.current.value.length
      editRef.current.setSelectionRange(len, len)
    }
  }, [isEditing])

  const handleStartEdit = () => {
    setEditText(originalText)
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditText(originalText)
  }

  const handleSaveEdit = async () => {
    const trimmed = editText.trim()
    if (!trimmed || trimmed === originalText) {
      handleCancelEdit()
      return
    }

    try {
      await onEditMessage(conversationId, message.id, trimmed)
      setIsEditing(false)
    } catch (error) {
      console.error('Errore durante la modifica del messaggio:', error)
    }
  }

  const handleEditKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelEdit()
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSaveEdit()
    }
  }

  // Chiudi dropdown file quando si clicca fuori
  useEffect(() => {
    if (!showFilesDropdown) return

    const handleClickOutside = (e) => {
      if (filesDropdownRef.current && !filesDropdownRef.current.contains(e.target)) {
        setShowFilesDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showFilesDropdown])

  return (
    <div
      className={`mb-4 sm:mb-6 flex ${isUser ? 'justify-end' : 'justify-start'}`}
      aria-live={message.isLoading ? 'polite' : undefined}
    >
      <div className="relative max-w-[95%] space-y-2 sm:space-y-3 sm:max-w-[90%] lg:max-w-[85%]">
        {shouldShowBubble ? (
          <div 
            className={`${bubbleClasses} group`}
            onMouseDown={isEditing ? (e) => {
              // Impedisce che click sullo sfondo tolgano focus dalla textarea
              if (e.target !== editRef.current) {
                e.preventDefault()
              }
            } : undefined}
          >
            {message.isLoading && !isStreaming ? (
              <Loader />
            ) : message.error ? (
              <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 text-sm">
                <div className="flex items-start gap-2">
                  <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="font-semibold text-red-700">Errore</p>
                    <p className="mt-1 text-red-600">{message.error}</p>
                  </div>
                </div>
              </div>
            ) : isEditing ? (
              <div className="text-sm sm:text-[0.95rem] leading-relaxed text-inherit">
                <textarea
                  ref={editRef}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  className="w-full resize-none border-none bg-transparent p-0 outline-none caret-[#7B1F34] text-inherit font-inherit leading-relaxed"
                  style={{ 
                    minHeight: '1.5em',
                    height: 'auto',
                    overflow: 'hidden',
                  }}
                  rows={Math.max(1, editText.split('\n').length)}
                />
                <div className="mt-2 flex items-center justify-end gap-2 text-[10px] sm:text-xs text-slate-400 select-none">
                  <span className="hidden sm:inline">Invio per salvare · Esc per annullare</span>
                  <span className="sm:hidden">↵ Salva · Esc Annulla</span>
                </div>
              </div>
            ) : (
              <div className="text-sm sm:text-[0.95rem] leading-relaxed text-inherit prose prose-slate prose-sm max-w-none overflow-hidden
                prose-headings:text-slate-800 prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
                prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
                prose-p:my-2 prose-p:leading-relaxed
                prose-strong:text-slate-900 prose-strong:font-semibold
                prose-em:text-slate-700 prose-em:italic
                prose-ul:my-2 prose-ul:pl-4 prose-ol:my-2 prose-ol:pl-4
                prose-li:my-0.5 prose-li:marker:text-slate-500
                prose-code:text-slate-800 prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-medium prose-code:before:content-none prose-code:after:content-none
                prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-pre:rounded-lg prose-pre:p-3
                prose-hr:my-4 prose-hr:border-slate-200
                prose-a:text-slate-700 prose-a:underline hover:prose-a:text-slate-900
              ">
                {(isStreaming ? originalText : renderedText) ? (
                  <div className="select-text">
                    <ReactMarkdown
                      components={{
                        // Personalizza rendering per elementi specifici
                        p: ({children}) => <p className="my-2 leading-relaxed">{children}</p>,
                        strong: ({children}) => <strong className="font-semibold text-slate-900">{children}</strong>,
                        em: ({children}) => <em className="italic text-slate-700">{children}</em>,
                        h1: ({children}) => <h1 className="text-lg font-bold text-slate-800 mt-4 mb-2 border-b border-slate-200 pb-1">{children}</h1>,
                        h2: ({children}) => <h2 className="text-base font-semibold text-slate-800 mt-3 mb-2">{children}</h2>,
                        h3: ({children}) => <h3 className="text-sm font-semibold text-slate-700 mt-2 mb-1">{children}</h3>,
                        ul: ({children}) => <ul className="my-2 pl-4 space-y-1">{children}</ul>,
                        ol: ({children}) => <ol className="my-2 pl-4 space-y-1 list-decimal">{children}</ol>,
                        li: ({children}) => <li className="text-slate-700 marker:text-slate-500">{children}</li>,
                        // Blocca completamente le <hr> - nel contesto legale sono quasi sempre artefatti
                        hr: () => null,
                        // Blocca rendering tabelle spurie
                        table: ({children}) => <div className="my-2">{children}</div>,
                        thead: ({children}) => <>{children}</>,
                        tbody: ({children}) => <>{children}</>,
                        tr: ({children}) => <p className="my-1">{children}</p>,
                        th: ({children}) => <strong className="mr-2">{children}</strong>,
                        td: ({children}) => <span className="mr-2">{children}</span>,
                        code: ({inline, children}) => 
                          inline ? (
                            <code className="text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded text-xs font-medium">{children}</code>
                          ) : (
                            // Renderizza code blocks come testo normale per evitare box grigi
                            <span className="block whitespace-pre-wrap">{children}</span>
                          ),
                        pre: ({children}) => (
                          // Renderizza pre come testo normale
                          <div className="whitespace-pre-wrap">{children}</div>
                        ),
                        a: ({children, href}) => <a href={href} className="text-slate-700 underline hover:text-slate-900">{children}</a>,
                      }}
                    >
                      {sanitizeMarkdown(isStreaming ? originalText : renderedText)}
                    </ReactMarkdown>
                    {(isTyping || isStreaming) ? <StreamingCursor /> : null}
                  </div>
                ) : null}
                {hasStructuredData ? (
                  <pre className="select-text mt-3 sm:mt-4 max-h-60 sm:max-h-80 overflow-y-auto rounded-lg sm:rounded-xl border border-slate-200 bg-slate-50/50 p-3 sm:p-4 text-[10px] sm:text-xs font-mono text-slate-600 shadow-inner">
                    {JSON.stringify(message.data, null, 2)}
                  </pre>
                ) : null}
                {/* Pulsanti Copia ed Esporta per messaggi assistente - sempre visibili */}
                {!isUser && !isStreaming && !isTyping && renderedText && renderedText.length > 10 ? (
                  <div className="mt-4 flex items-center justify-end gap-2">
                    {/* Pulsante Copia */}
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const textToCopy = originalText || renderedText || ''
                          if (!textToCopy) return
                          await navigator.clipboard.writeText(textToCopy)
                          setDidCopy(true)
                          setTimeout(() => setDidCopy(false), 1500)
                        } catch (error) {
                          console.error('Impossibile copiare il testo:', error)
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-[#7B1F34] hover:bg-[#7B1F34] hover:text-white hover:shadow-md"
                    >
                      {didCopy ? (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Copiato!</span>
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8a2 2 0 012 2v9a2 2 0 01-2 2H8a2 2 0 01-2-2V9a2 2 0 012-2z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16 3H9a2 2 0 00-2 2v1" />
                          </svg>
                          <span>Copia</span>
                        </>
                      )}
                    </button>
                    {/* Pulsante Esporta */}
                    <ExportMenu 
                      content={renderedText}
                      title="Report Legistra"
                      position="top-right"
                      customStyles={exportStyles}
                    />
                  </div>
                ) : null}
              </div>
            )}
            {/* Bottone modifica per messaggi utente - in basso a destra */}
            {canEdit && !isEditing ? (
              <div className="absolute -bottom-3 -right-1 sm:-bottom-4 sm:-right-3 flex gap-1">
                <button
                  type="button"
                  onClick={handleStartEdit}
                  className="inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 opacity-0 shadow-lg transition-all group-hover:opacity-100 hover:border-[#7B1F34] hover:bg-[#7B1F34] hover:text-white hover:shadow-xl"
                  aria-label="Modifica messaggio"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3 sm:h-3.5 sm:w-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                  </svg>
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {isDraft ? (
          <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">In attesa di invio</p>
        ) : null}
        {message.files?.length ? (
          <div
            ref={filesDropdownRef}
            className={`relative ${isUser ? 'flex justify-end' : ''}`}
          >
            <button
              type="button"
              onClick={() => setShowFilesDropdown(!showFilesDropdown)}
              className={`inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:shadow ${
                showFilesDropdown ? 'border-[#7B1F34] ring-1 ring-[#7B1F34]/20' : ''
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-[#7B1F34]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
              </svg>
              <span>
                {message.files.length === 1 
                  ? message.files[0].name 
                  : `${message.files.length} documenti`}
              </span>
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 20 20" 
                fill="currentColor" 
                className={`h-4 w-4 text-slate-400 transition-transform ${showFilesDropdown ? 'rotate-180' : ''}`}
              >
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </button>
            {showFilesDropdown && (
              <div className={`absolute z-10 mt-1 w-64 rounded-lg border border-slate-200 bg-white py-1 shadow-lg ${
                isUser ? 'right-0' : 'left-0'
              }`} style={{ top: '100%' }}>
                {message.files.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 flex-shrink-0 text-slate-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-slate-700">{file.name}</p>
                      <p className="text-[10px] text-slate-400">{formatBytes(file.size)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
