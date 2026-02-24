import { useState, useRef, useEffect, useCallback } from 'react'
import { searchLegislation, getCodes, getArticle, getNearbyArticles } from '../services/legislation'
import { exportToWord } from '../services/export'

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY ?? ''
const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY ?? ''

function formatMemoHtml(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^#{1,3}\s+(.+)$/gm, '<h3 style="font-weight:700;font-size:0.95rem;color:#1e293b;margin:1.2em 0 0.4em">$1</h3>')
    .replace(/^---+$/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n{2,}/g, '</p><p style="margin:0.6em 0;line-height:1.7">')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p style="margin:0.6em 0;line-height:1.7">')
    .replace(/$/, '</p>')
}

export default function LegislationSearch({ onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState(null)
  const [codes, setCodes] = useState([])
  const [selectedCode, setSelectedCode] = useState(null)

  const [article, setArticle] = useState(null)
  const [nearbyArticles, setNearbyArticles] = useState([])
  const [loadingArticle, setLoadingArticle] = useState(false)

  const [memoText, setMemoText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [showMemo, setShowMemo] = useState(false)

  const inputRef = useRef(null)
  const articleRef = useRef(null)

  useEffect(() => {
    getCodes().then(setCodes).catch(() => {})
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        if (article) { setArticle(null); return }
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose, article])

  const handleSearch = useCallback(async (e) => {
    e?.preventDefault()
    if (!query.trim() || isSearching) return
    setIsSearching(true)
    setError(null)
    setResults([])
    setArticle(null)

    try {
      const { results: r } = await searchLegislation(query.trim(), selectedCode, 30)
      setResults(r || [])
      if (!r?.length) setError('Nessun risultato trovato.')
    } catch {
      setError('Errore nella ricerca.')
    } finally {
      setIsSearching(false)
    }
  }, [query, isSearching, selectedCode])

  const openArticle = useCallback(async (codeId, artNum) => {
    setLoadingArticle(true)
    try {
      const [art, nearby] = await Promise.all([
        getArticle(codeId, artNum),
        getNearbyArticles(codeId, artNum, 5),
      ])
      setArticle(art)
      setNearbyArticles(nearby || [])
      articleRef.current?.scrollTo(0, 0)
    } catch {
      setError('Articolo non trovato.')
    } finally {
      setLoadingArticle(false)
    }
  }, [])

  const handleGenerateMemo = useCallback(async () => {
    if (results.length === 0 || isGenerating) return
    setIsGenerating(true)
    setShowMemo(true)
    setMemoText('')

    const context = results.slice(0, 10).map((a, i) =>
      `[${i + 1}] Art. ${a.article_number} ${a.code_name} - ${a.article_title || ''}\n${(a.article_text || '').slice(0, 800)}`
    ).join('\n\n---\n\n')

    const systemPrompt = `Sei un avvocato senior con 20 anni di esperienza. Redigi un memo legale interno di studio, destinato a un collega che deve comprendere rapidamente la materia e applicarla a un caso concreto.

REGOLE DI STILE:
- Scrivi in italiano, con linguaggio tecnico-giuridico ma chiaro
- Usa paragrafi discorsivi, NON elenchi puntati (ammessi solo per citare più articoli)
- Cita SEMPRE gli articoli di legge specifici (es. art. 2043 c.c., art. 575 c.p.)
- Quando citi una norma, riporta tra virgolette il passaggio chiave del testo
- Integra i riferimenti giurisprudenziali quando rilevanti (Cass. Sez. Unite, Cass. Civ., etc.)
- Ogni affermazione giuridica deve essere supportata da un fondamento normativo
- Distingui chiaramente tra orientamento maggioritario e minoritario quando esistono contrasti

STRUTTURA DEL MEMO:

**OGGETTO**
Una frase che identifica il tema giuridico trattato.

**QUADRO NORMATIVO**
Le norme di riferimento con il testo degli articoli rilevanti, commentate e contestualizzate. Parti dal codice e poi le leggi speciali.

**ORIENTAMENTI GIURISPRUDENZIALI**
Come i tribunali interpretano e applicano queste norme. Distingui tra giurisprudenza di legittimità e di merito.

**APPLICAZIONE PRATICA**
Come queste norme si applicano nella pratica forense: onere della prova, termini, competenza, rito applicabile, strategie processuali.

**PROFILI CRITICI**
Aspetti controversi, rischi, zone grigie interpretative, possibili eccezioni della controparte.

**CONCLUSIONI OPERATIVE**
Indicazioni concrete e operative per il collega: cosa fare, cosa evitare, quali atti predisporre.`

    const userMessage = `Redigi un memo legale interno su: "${query}"

Norme individuate nel database:

${context}

Redigi il memo completo seguendo la struttura indicata. Cita sempre gli articoli specifici con il testo tra virgolette quando rilevante.`

    try {
      const apiKey = ANTHROPIC_API_KEY || OPENAI_API_KEY
      const isAnthropic = !!ANTHROPIC_API_KEY

      const response = await fetch(
        isAnthropic ? 'https://api.anthropic.com/v1/messages' : 'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(isAnthropic
              ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }
              : { 'Authorization': `Bearer ${apiKey}` }),
          },
          body: JSON.stringify(
            isAnthropic
              ? { model: 'claude-sonnet-4-20250514', max_tokens: 8000, temperature: 0.3, system: systemPrompt, messages: [{ role: 'user', content: userMessage }], stream: true }
              : { model: 'gpt-4o', temperature: 0.3, max_tokens: 8000, stream: true, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }] }
          ),
        }
      )

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let full = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of decoder.decode(value, { stream: true }).split('\n').filter(l => l.startsWith('data: ') && !l.includes('[DONE]'))) {
          try {
            const parsed = JSON.parse(line.slice(6))
            const t = isAnthropic ? (parsed.type === 'content_block_delta' ? parsed.delta?.text : '') : parsed.choices?.[0]?.delta?.content
            if (t) { full += t; setMemoText(full) }
          } catch {}
        }
      }
    } catch {
      setMemoText('Errore durante la generazione.')
    } finally {
      setIsGenerating(false)
    }
  }, [results, query, isGenerating])

  const codeName = (id) => codes.find(c => c.id === id)?.name || id?.toUpperCase()

  // Prev / Next from nearby
  const currentIdx = nearbyArticles.findIndex(na => na.article_number === article?.article_number)
  const prevArt = currentIdx > 0 ? nearbyArticles[currentIdx - 1] : null
  const nextArt = currentIdx >= 0 && currentIdx < nearbyArticles.length - 1 ? nearbyArticles[currentIdx + 1] : null

  return (
    <div className="fixed inset-0 z-50 flex bg-slate-900/40 backdrop-blur-sm">
      <div className="relative ml-auto flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#7B1F34] to-[#9E3A50]">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.97zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.97z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Legislazione</h2>
              <p className="text-xs text-slate-500">Codici e leggi italiane</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* =================== ARTICLE VIEW =================== */}
        {article ? (
          <div ref={articleRef} className="flex-1 overflow-y-auto">
            {/* Back + nav bar */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
              <button
                onClick={() => setArticle(null)}
                className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-[#7B1F34] transition"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                Risultati
              </button>
              <div className="flex items-center gap-1">
                {prevArt && (
                  <button onClick={() => openArticle(article.code_id, prevArt.article_number)} className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 transition">
                    ← Art. {prevArt.article_number}
                  </button>
                )}
                {nextArt && (
                  <button onClick={() => openArticle(article.code_id, nextArt.article_number)} className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 transition">
                    Art. {nextArt.article_number} →
                  </button>
                )}
              </div>
            </div>

            {/* Article content */}
            <div className="px-6 py-6">
              <div className="mb-1 flex items-center gap-2">
                <span className="inline-block rounded bg-[#7B1F34] px-2.5 py-1 text-xs font-bold text-white">
                  Art. {article.article_number}
                </span>
                <span className="text-xs font-medium text-slate-400 uppercase">{article.legislation_codes?.name || codeName(article.code_id)}</span>
              </div>

              {article.article_title && (
                <h3 className="mt-2 text-lg font-bold text-slate-900">{article.article_title}</h3>
              )}

              {(article.book || article.title) && (
                <p className="mt-1 text-xs text-slate-400">{article.book}{article.title ? ` › ${article.title}` : ''}{article.chapter ? ` › ${article.chapter}` : ''}</p>
              )}

              <div className="mt-6 text-[15px] text-slate-700 leading-[1.8] whitespace-pre-line">
                {article.article_text}
              </div>

              {article.normattiva_url && (
                <a href={article.normattiva_url} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-1.5 text-xs text-[#7B1F34] hover:underline">
                  Verifica su Normattiva
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
              )}
            </div>

            {/* Bottom nav */}
            <div className="sticky bottom-0 border-t border-slate-200 bg-white px-6 py-3 flex items-center justify-between">
              {prevArt ? (
                <button onClick={() => openArticle(article.code_id, prevArt.article_number)} className="flex items-center gap-2 text-sm text-slate-600 hover:text-[#7B1F34] transition">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                  <div className="text-left">
                    <p className="text-xs text-slate-400">Precedente</p>
                    <p className="font-medium">Art. {prevArt.article_number}</p>
                  </div>
                </button>
              ) : <span />}
              {nextArt ? (
                <button onClick={() => openArticle(article.code_id, nextArt.article_number)} className="flex items-center gap-2 text-sm text-slate-600 hover:text-[#7B1F34] transition">
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Successivo</p>
                    <p className="font-medium">Art. {nextArt.article_number}</p>
                  </div>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </button>
              ) : <span />}
            </div>
          </div>
        ) : (
          /* =================== RESULTS VIEW =================== */
          <>
            {/* Search bar */}
            <form onSubmit={handleSearch} className="border-b border-slate-100 px-6 py-4">
              <div className="flex gap-2">
                <select
                  value={selectedCode || ''}
                  onChange={(e) => setSelectedCode(e.target.value || null)}
                  className="rounded-xl border border-slate-200 bg-slate-50 pl-2 pr-6 py-2.5 text-xs text-slate-600 appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22M6%209l6%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[position:right_4px_center]"
                >
                  <option value="">Tutti i codici</option>
                  {codes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cosa stai cercando?"
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#7B1F34] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#7B1F34]"
                />
                <button type="submit" disabled={isSearching || !query.trim()} className="rounded-xl bg-gradient-to-r from-[#7B1F34] to-[#9E3A50] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:shadow-md disabled:opacity-50">
                  {isSearching ? <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg> : 'Cerca'}
                </button>
              </div>
            </form>

            {/* Results */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {error && <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">{error}</div>}

              {results.length > 0 && (
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-xs text-slate-500">{results.length} risultati</p>
                  <button onClick={handleGenerateMemo} disabled={isGenerating} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#7B1F34] to-[#9E3A50] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow-md disabled:opacity-50">
                    {isGenerating ? 'Generazione...' : 'Genera Memo Legale'}
                  </button>
                </div>
              )}

              {/* Memo */}
              {showMemo && (
                <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-200 bg-[#7B1F34] px-4 py-3 rounded-t-xl">
                    <span className="text-sm font-semibold text-white">{query}</span>
                    <div className="flex gap-1">
                      {memoText && !isGenerating && (
                        <button onClick={() => exportToWord({ title: `Memo: ${query}`, content: memoText, filename: `memo_legale_${query.replace(/\s+/g, '_').slice(0, 30)}.docx` })} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white text-xs">Esporta Word</button>
                      )}
                      <button onClick={() => { setShowMemo(false); setMemoText('') }} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white">✕</button>
                    </div>
                  </div>
                  <div className="px-4 py-3 text-sm text-slate-700 leading-relaxed max-h-[50vh] overflow-y-auto">
                    {memoText ? (
                      <div dangerouslySetInnerHTML={{ __html: formatMemoHtml(memoText) }} />
                    ) : (
                      <span className="text-slate-400">Generazione in corso...</span>
                    )}
                    {isGenerating && <span className="inline-block w-1 h-4 bg-[#7B1F34] animate-pulse ml-0.5" />}
                  </div>
                </div>
              )}

              {/* Article cards */}
              <div className="space-y-2">
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => openArticle(r.code_id, r.article_number)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-[#7B1F34]/30 hover:shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex-shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                        {r.article_number}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-slate-800">{r.article_title || `Articolo ${r.article_number}`}</span>
                        {r.code_name && <span className="ml-2 text-[10px] font-medium text-[#7B1F34] uppercase">{r.code_name}</span>}
                      </div>
                      <svg className="h-4 w-4 flex-shrink-0 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </div>
                  </button>
                ))}
              </div>

              {/* Empty state with suggestions */}
              {!isSearching && results.length === 0 && !error && !showMemo && (
                <div className="py-8">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-4">Ricerche frequenti</p>
                  <div className="space-y-2">
                    {[
                      'risarcimento danno',
                      'inadempimento contrattuale',
                      'responsabilità extracontrattuale',
                      'termine prescrizione',
                      'diritto di recesso',
                      'licenziamento giusta causa',
                      'custodia cautelare',
                      'legittima difesa',
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={async () => {
                          setQuery(suggestion)
                          setIsSearching(true)
                          setError(null)
                          setResults([])
                          try {
                            const { results: r } = await searchLegislation(suggestion, selectedCode, 30)
                            setResults(r || [])
                            if (!r?.length) setError('Nessun risultato trovato.')
                          } catch { setError('Errore nella ricerca.') }
                          finally { setIsSearching(false) }
                        }}
                        className="flex w-full items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 text-left text-sm text-slate-600 transition hover:border-[#7B1F34]/20 hover:bg-slate-50"
                      >
                        <svg className="h-4 w-4 flex-shrink-0 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                        </svg>
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {loadingArticle && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/70">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-[#7B1F34]" />
          </div>
        )}
      </div>
      <div className="flex-1" onClick={onClose} />
    </div>
  )
}
