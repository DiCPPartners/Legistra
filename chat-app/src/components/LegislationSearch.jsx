import { useState, useRef, useEffect, useCallback } from 'react'
import { searchLegislation, fetchArticolo } from '../services/legislation'
import { exportToWord } from '../services/export'

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY ?? ''
const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY ?? ''

function formatReviewHtml(text) {
  if (!text) return ''
  
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const lines = escaped.split('\n')
  let html = ''
  let inSummary = false
  let inReferences = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      if (!inSummary) html += '<div style="height:0.6em"></div>'
      continue
    }

    // Topic title
    if (trimmed.startsWith('TOPIC_TITLE:')) {
      const title = trimmed.replace('TOPIC_TITLE:', '').trim()
      html += `<h2 style="font-size:1.25rem;font-weight:700;color:#1a5276;margin:0 0 0.5em;padding-bottom:0.4em;border-bottom:2px solid #1a5276">${title}</h2>`
      continue
    }

    // Summary and Recommendations block
    if (trimmed === 'SINTESI E RACCOMANDAZIONI' || trimmed.startsWith('SINTESI E RACCOMANDAZIONI')) {
      inSummary = true
      html += `<div style="background:#eaf2f8;border-left:4px solid #1a5276;padding:1em 1.2em;margin:1em 0;border-radius:0 6px 6px 0">`
      html += `<div style="font-weight:700;color:#1a5276;font-size:0.95rem;margin-bottom:0.6em">SINTESI E RACCOMANDAZIONI</div>`
      continue
    }

    if (inSummary) {
      if (/^[A-ZÀÈÉÌÒÙÂÊÎÔÛ\s/]{4,}$/.test(trimmed) && !trimmed.startsWith('●')) {
        html += '</div>'
        inSummary = false
      } else {
        const bullet = trimmed.startsWith('●') ? trimmed : (trimmed.startsWith('-') ? '●' + trimmed.slice(1) : trimmed)
        const withBold = bullet.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        html += `<div style="margin:0.4em 0;padding-left:0.5em;line-height:1.6;font-size:0.88rem">${withBold}</div>`
        continue
      }
    }

    // References section
    if (trimmed === 'REFERENCES' || trimmed === 'RIFERIMENTI BIBLIOGRAFICI' || trimmed.startsWith('REFERENCES')) {
      inReferences = true
      html += `<div style="font-weight:700;color:#1a5276;font-size:0.95rem;margin:1.5em 0 0.5em;padding-top:0.8em;border-top:1px solid #d5dbdb">REFERENCES</div>`
      continue
    }

    if (inReferences) {
      const withLinks = trimmed.replace(/((?:Legge|D\.Lgs\.|D\.L\.|DPR|L\.)\s*(?:n\.\s*)?\d+\/\d+)/g, '<strong style="color:#1a5276">$1</strong>')
      html += `<div style="font-size:0.8rem;color:#555;margin:0.25em 0;line-height:1.5;padding-left:1.5em;text-indent:-1.5em">${withLinks}</div>`
      continue
    }

    // Section headings (ALL CAPS)
    if (/^[A-ZÀÈÉÌÒÙÂÊÎÔÛ\s/\-]{4,}$/.test(trimmed)) {
      html += `<h3 style="font-weight:700;font-size:0.95rem;color:#1a5276;margin:1.4em 0 0.4em;padding-top:0.6em;border-top:1px solid #eaecee">${trimmed}</h3>`
      continue
    }

    // Sub-section headings (Title Case, shorter lines ending without period)
    if (/^[A-ZÀÈÉÌÒÙ][a-zàèéìòùA-Z\s,\-']{3,60}$/.test(trimmed) && !trimmed.endsWith('.') && !trimmed.endsWith(',') && lines[i + 1]?.trim()) {
      html += `<h4 style="font-weight:600;font-size:0.9rem;color:#2c3e50;margin:1em 0 0.3em">${trimmed}</h4>`
      continue
    }

    // Markdown headings
    if (trimmed.startsWith('## ')) {
      html += `<h3 style="font-weight:700;font-size:0.95rem;color:#1a5276;margin:1.4em 0 0.4em;padding-top:0.6em;border-top:1px solid #eaecee">${trimmed.slice(3)}</h3>`
      continue
    }
    if (trimmed.startsWith('### ')) {
      html += `<h4 style="font-weight:600;font-size:0.9rem;color:#2c3e50;margin:1em 0 0.3em">${trimmed.slice(4)}</h4>`
      continue
    }

    // Body text
    let processed = trimmed
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\[(\d+(?:[,-]\d+)*)\]/g, '<sup style="color:#1a5276;font-size:0.75em;cursor:pointer">[$1]</sup>')
      .replace(/\(See '([^']+)'\)/g, '<em style="color:#1a5276">(See \'$1\')</em>')

    html += `<p style="margin:0.4em 0;line-height:1.7;font-size:0.88rem;color:#333">${processed}</p>`
  }

  if (inSummary) html += '</div>'
  return html
}

export default function LegislationSearch({ onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState(null)
  const [source, setSource] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [articleText, setArticleText] = useState(null)
  const [loadingArticle, setLoadingArticle] = useState(false)
  const [reviewText, setReviewText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const reviewRef = useRef(null)
  const inputRef = useRef(null)
  const panelRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleEscape = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const handleSearch = useCallback(async (e) => {
    e?.preventDefault()
    if (!query.trim() || isSearching) return

    setIsSearching(true)
    setError(null)
    setResults([])

    try {
      const { articles, totalCount: total, source: src } = await searchLegislation(query.trim(), OPENAI_API_KEY, 20)
      setResults(articles)
      setTotalCount(total)
      setSource(src)
      if (articles.length === 0) setError('Nessun risultato trovato.')
    } catch (err) {
      setError('Errore nella ricerca. Riprova.')
      console.error('Legislation search error:', err)
    } finally {
      setIsSearching(false)
    }
  }, [query, isSearching])

  const handleGenerateReview = useCallback(async () => {
    if (results.length === 0 || isGenerating) return
    
    setIsGenerating(true)
    setShowReview(true)
    setReviewText('')

    const articlesContext = results.slice(0, 15).map((a, i) =>
      `[${i + 1}] ${a.citation}` +
      (a.summary ? `\nRilevanza: ${a.summary}` : '') +
      (a.articles ? `\nArticoli: ${a.articles}` : '')
    ).join('\n\n---\n\n')

    const systemPrompt = `Sei un giurista esperto. Scrivi un memo legale strutturato e professionale.

Lingua: ITALIANO.

FORMATO MEMO LEGALE (segui questo schema):

1. Inizia con: TOPIC_TITLE: [titolo dell'argomento giuridico]

2. Subito dopo, scrivi un blocco SINTESI E RACCOMANDAZIONI:
   - Inizia con "SINTESI E RACCOMANDAZIONI"
   - Elenca i punti chiave come bullet points con il simbolo ●
   - Evidenzia le norme fondamentali e gli orientamenti giurisprudenziali

3. Poi le sezioni del memo, ciascuna con titolo in MAIUSCOLO:
   - QUADRO NORMATIVO
   - EVOLUZIONE LEGISLATIVA (se rilevante)
   - GIURISPRUDENZA DI RIFERIMENTO
   - DOTTRINA
   - APPLICAZIONE PRATICA
   - PROFILI CRITICI
   - ORIENTAMENTI RECENTI

4. Stile memo legale:
   - Ogni sezione può avere sottosezioni con titolo in Title Case
   - Il testo è giuridico, preciso, orientato alla pratica professionale
   - Le citazioni nel testo usano numeri tra parentesi quadre: [1], [2,3], [4-6]
   - I paragrafi sono densi di informazioni ma chiari
   - Cita sempre articoli di legge specifici (art. 1218 c.c., art. 2043 c.c., ecc.)

5. Alla fine: REFERENCES - Lista numerata [1], [2], ecc. con citazioni complete delle norme

NON inventare dati. Usa SOLO le informazioni dalle norme fornite.
I titoli delle sezioni devono essere in MAIUSCOLO. I titoli delle sottosezioni in Title Case.`

    const userMessage = `Scrivi un memo legale sull'argomento: "${query}"

Norme di riferimento:

${articlesContext}

Genera il memo legale completo, in italiano.`

    try {
      // Usa Claude se disponibile, altrimenti GPT-4o
      if (ANTHROPIC_API_KEY) {
        const claudeMessages = [{ role: 'user', content: userMessage }]
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 8000,
            temperature: 0.3,
            system: systemPrompt,
            messages: claudeMessages,
            stream: true
          })
        })

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let full = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          for (const line of chunk.split('\n').filter(l => l.startsWith('data: '))) {
            try {
              const parsed = JSON.parse(line.slice(6))
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                full += parsed.delta.text
                setReviewText(full)
              }
            } catch { /* ignore */ }
          }
        }
      } else {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            temperature: 0.3,
            max_tokens: 8000,
            stream: true,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage }
            ]
          })
        })

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let full = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          for (const line of chunk.split('\n').filter(l => l.startsWith('data: ') && !l.includes('[DONE]'))) {
            try {
              const parsed = JSON.parse(line.slice(6))
              const content = parsed.choices?.[0]?.delta?.content
              if (content) {
                full += content
                setReviewText(full)
              }
            } catch { /* ignore */ }
          }
        }
      }
    } catch (err) {
      console.error('Errore generazione review:', err)
      setReviewText('Errore durante la generazione. Riprova.')
    } finally {
      setIsGenerating(false)
      setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
  }, [results, query, isGenerating])

  const handleExportReview = useCallback(async () => {
    if (!reviewText) return
    await exportToWord({
      title: `Review: ${query}`,
      content: reviewText,
      download: true,
      filename: `memo_legale_${query.replace(/\s+/g, '_').slice(0, 30)}.docx`
    })
  }, [reviewText, query])

  const handleCopyReview = useCallback(async () => {
    if (!reviewText) return
    try {
      await navigator.clipboard.writeText(reviewText)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = reviewText
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
  }, [reviewText])

  const handleCopyCitation = useCallback(async (article) => {
    try {
      await navigator.clipboard.writeText(article.citation)
      setCopiedId(article.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = article.citation
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopiedId(article.id)
      setTimeout(() => setCopiedId(null), 2000)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex bg-slate-900/40 backdrop-blur-sm">
      <div
        ref={panelRef}
        className="relative ml-auto flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#2f9aa7] to-[#3eb8a8]">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.97zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.97z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Legislazione</h2>
              <p className="text-xs text-slate-500">Cerca nelle leggi italiane</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="border-b border-slate-100 px-6 py-4">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca norme: es. responsabilità contrattuale, art. 2043 c.c...."
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#2f9aa7] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#2f9aa7]"
            />
            <button
              type="submit"
              disabled={isSearching || !query.trim()}
              className="rounded-xl bg-gradient-to-r from-[#2f9aa7] to-[#3eb8a8] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:shadow-md disabled:opacity-50"
            >
              {isSearching ? (
                <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : 'Cerca'}
            </button>
          </div>
        </form>

        {/* Article text viewer */}
        {articleText && (
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#2f9aa7]">{articleText.codice?.toUpperCase()} — Art. {articleText.articolo}</span>
              <button onClick={() => setArticleText(null)} className="text-xs text-slate-400 hover:text-slate-600">Chiudi</button>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line max-h-48 overflow-y-auto">{articleText.text}</p>
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
              {error}
            </div>
          )}

          {results.length > 0 && (
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-xs text-slate-500">
                  {totalCount > results.length
                    ? `${results.length} di ${totalCount.toLocaleString('it-IT')} risultati`
                    : `${results.length} risultati`
                  }
                </p>
                {source && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    source === 'normattiva' 
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${source === 'normattiva' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    {source === 'normattiva' ? 'Normattiva.it' : 'AI'}
                  </span>
                )}
              </div>
              <button
                onClick={handleGenerateReview}
                disabled={isGenerating}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#2f9aa7] to-[#3eb8a8] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow-md disabled:opacity-50"
              >
                {isGenerating ? (
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.898l-2.051-.683a1 1 0 01-.633-.633L6.95 5.684z" />
                  </svg>
                )}
                {isGenerating ? 'Generazione...' : 'Genera Memo Legale'}
              </button>
            </div>
          )}

          {/* Generated Review */}
          {showReview && (
            <div ref={reviewRef} className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 bg-[#1a5276] px-4 py-3 rounded-t-xl">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-white/80">
                    <path d="M10.75 16.82A7.462 7.462 0 0115 15.5c.71 0 1.396.098 2.046.282A.75.75 0 0018 15.06V4.44a.75.75 0 00-.546-.722A9.006 9.006 0 0015 3.5a9.006 9.006 0 00-4.25 1.065v12.255zM9.25 4.565A9.006 9.006 0 005 3.5c-.85 0-1.673.118-2.454.339A.75.75 0 002 4.56v10.5a.75.75 0 00.954.721A7.506 7.506 0 015 15.5a7.462 7.462 0 014.25 1.32V4.565z" />
                  </svg>
                  <span className="text-sm font-semibold text-white">{query}</span>
                </div>
                <div className="flex items-center gap-1">
                  {reviewText && !isGenerating && (
                    <>
                      <button onClick={handleCopyReview} className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white" title="Copia testo">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                          <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                          <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
                        </svg>
                      </button>
                      <button onClick={handleExportReview} className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white" title="Esporta Word">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                          <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                          <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                        </svg>
                      </button>
                    </>
                  )}
                  <button onClick={() => { setShowReview(false); setReviewText('') }} className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="px-4 py-3 text-sm text-slate-700 leading-relaxed max-h-[60vh] overflow-y-auto">
                {reviewText ? (
                  <div dangerouslySetInnerHTML={{ __html: formatReviewHtml(reviewText) }} />
                ) : (
                  <div className="flex items-center gap-2 text-slate-400 py-4">
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Generazione in corso...
                  </div>
                )}
                {isGenerating && <span className="inline-block w-1 h-4 bg-[#2f9aa7] animate-pulse ml-0.5" />}
              </div>
            </div>
          )}

          <div className="space-y-4">
            {results.map((article) => (
              <div
                key={article.id}
                className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
              >
                {/* Title */}
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-[#2f9aa7] hover:underline leading-snug"
                >
                  {article.title}
                </a>

                {/* Type + Number + Date */}
                <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                  <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600 mr-1">{article.type}</span>
                  {article.number && `n. ${article.number}`}
                  {article.date && ` del ${new Date(article.date).toLocaleDateString('it-IT')}`}
                </p>

                {article.articles && (
                  <p className="mt-1 text-xs text-[#2f9aa7] font-medium">{article.articles}</p>
                )}
                {article.summary && (
                  <p className="mt-2 text-xs text-slate-600 leading-relaxed">{article.summary}</p>
                )}

                {/* Actions */}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => handleCopyCitation(article)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-[#2f9aa7] hover:text-[#2f9aa7]"
                  >
                    {copiedId === article.id ? (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-green-500">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                        </svg>
                        Copiato
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                          <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                          <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
                        </svg>
                        Copia citazione
                      </>
                    )}
                  </button>
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-[#2f9aa7] hover:text-[#2f9aa7]"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                      <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" />
                      <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" />
                    </svg>
                    Apri su Normattiva
                  </a>
                </div>
              </div>
            ))}
          </div>

          {/* Empty state */}
          {!isSearching && results.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-8 w-8 text-slate-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-slate-700">Cerca nella Legislazione</h3>
              <p className="mt-1 text-xs text-slate-500 max-w-xs">
                Cerca norme per materia, articolo di legge, codice o parola chiave
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Click outside to close */}
      <div className="flex-1" onClick={onClose} />
    </div>
  )
}
