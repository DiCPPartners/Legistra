import { useState, useRef, useEffect, useCallback } from 'react'
import { searchLegislation, getCodes, getArticle, browseCode, getNearbyArticles, quickLookup } from '../services/legislation'
import { exportToWord } from '../services/export'

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY ?? ''
const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY ?? ''

export default function LegislationSearch({ onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState(null)
  const [codes, setCodes] = useState([])
  const [selectedCode, setSelectedCode] = useState(null)
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [loadingArticle, setLoadingArticle] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  const [nearbyArticles, setNearbyArticles] = useState([])
  const [browseArticles, setBrowseArticles] = useState([])
  const [browseTotal, setBrowseTotal] = useState(0)
  const [browseOffset, setBrowseOffset] = useState(0)
  const [mode, setMode] = useState('search')
  const [quickInput, setQuickInput] = useState('')
  const [memoText, setMemoText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [showMemo, setShowMemo] = useState(false)
  const memoRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    getCodes().then(setCodes).catch(() => {})
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
    setSelectedArticle(null)
    setMode('search')

    try {
      const { results: r } = await searchLegislation(query.trim(), selectedCode, 30)
      setResults(r || [])
      if (!r?.length) setError('Nessun risultato trovato.')
    } catch {
      setError('Errore nella ricerca. Riprova.')
    } finally {
      setIsSearching(false)
    }
  }, [query, isSearching, selectedCode])

  const handleBrowse = useCallback(async (codeId, offset = 0) => {
    setSelectedCode(codeId)
    setMode('browse')
    setBrowseOffset(offset)
    setSelectedArticle(null)
    try {
      const { articles, total } = await browseCode(codeId, { limit: 50, offset })
      setBrowseArticles(articles || [])
      setBrowseTotal(total || 0)
    } catch {
      setError('Errore nel caricamento.')
    }
  }, [])

  const handleViewArticle = useCallback(async (codeId, artNum) => {
    setLoadingArticle(true)
    try {
      const [article, nearby] = await Promise.all([
        getArticle(codeId, artNum),
        getNearbyArticles(codeId, artNum, 5),
      ])
      setSelectedArticle(article)
      setNearbyArticles(nearby || [])
    } catch {
      setError('Articolo non trovato.')
    } finally {
      setLoadingArticle(false)
    }
  }, [])

  const handleQuickLookup = useCallback(async (e) => {
    e?.preventDefault()
    if (!quickInput.trim()) return
    setLoadingArticle(true)
    setError(null)
    try {
      const article = await quickLookup(quickInput.trim())
      if (article) {
        setSelectedArticle(article)
        const nearby = await getNearbyArticles(article.code_id, article.article_number, 5)
        setNearbyArticles(nearby || [])
      } else {
        setError('Formato non riconosciuto. Prova: "2043 cc", "art. 575 cp", "42 cost"')
      }
    } catch {
      setError('Articolo non trovato.')
    } finally {
      setLoadingArticle(false)
    }
  }, [quickInput])

  const formatCitation = useCallback((article) => {
    const codeMap = { cc: 'c.c.', cp: 'c.p.', cpc: 'c.p.c.', cpp: 'c.p.p.', cost: 'Cost.' }
    const code = codeMap[article.code_id] || article.code_id
    let cite = `Art. ${article.article_number} ${code}`
    if (article.article_title) cite += ` (${article.article_title})`
    return cite
  }, [])

  const handleCopy = useCallback(async (text, id) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  const handleGenerateMemo = useCallback(async () => {
    if (results.length === 0 || isGenerating) return
    setIsGenerating(true)
    setShowMemo(true)
    setMemoText('')

    const context = results.slice(0, 10).map((a, i) =>
      `[${i + 1}] Art. ${a.article_number} ${a.code_name} - ${a.article_title || ''}\n${(a.article_text || '').slice(0, 800)}`
    ).join('\n\n---\n\n')

    const systemPrompt = `Sei un giurista esperto. Scrivi un memo legale strutturato e professionale in ITALIANO.
Cita sempre gli articoli specifici. Stile giuridico, preciso, orientato alla pratica.
Struttura: SINTESI, QUADRO NORMATIVO, ANALISI, APPLICAZIONE PRATICA, CONCLUSIONI, REFERENCES.`

    const userMessage = `Memo legale su: "${query}"\n\nNorme di riferimento:\n${context}\n\nGenera il memo completo.`

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
        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split('\n').filter(l => l.startsWith('data: ') && !l.includes('[DONE]'))) {
          try {
            const parsed = JSON.parse(line.slice(6))
            const text = isAnthropic
              ? (parsed.type === 'content_block_delta' ? parsed.delta?.text : '')
              : parsed.choices?.[0]?.delta?.content
            if (text) { full += text; setMemoText(full) }
          } catch { /* ignore */ }
        }
      }
    } catch {
      setMemoText('Errore durante la generazione. Riprova.')
    } finally {
      setIsGenerating(false)
      setTimeout(() => memoRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
  }, [results, query, isGenerating])

  const codeName = (id) => codes.find(c => c.id === id)?.name || id.toUpperCase()

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
              <p className="text-xs text-slate-500">Codici e leggi italiane — ricerca istantanea</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
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
              placeholder="Cerca: risarcimento danno, art. 2043, contratto..."
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#7B1F34] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#7B1F34]"
            />
            <select
              value={selectedCode || ''}
              onChange={(e) => setSelectedCode(e.target.value || null)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600"
            >
              <option value="">Tutti</option>
              {codes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="submit" disabled={isSearching || !query.trim()} className="rounded-xl bg-gradient-to-r from-[#7B1F34] to-[#9E3A50] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:shadow-md disabled:opacity-50">
              {isSearching ? <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg> : 'Cerca'}
            </button>
          </div>
        </form>

        {/* Quick lookup bar */}
        <form onSubmit={handleQuickLookup} className="border-b border-slate-100 px-6 py-2 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 whitespace-nowrap">Vai a:</span>
            <input
              type="text"
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              placeholder="2043 cc, art. 575 cp, 42 cost..."
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-300 focus:border-[#7B1F34] focus:outline-none focus:ring-1 focus:ring-[#7B1F34]"
            />
            <button type="submit" disabled={!quickInput.trim()} className="rounded-lg bg-[#7B1F34] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-30">
              Apri
            </button>
          </div>
        </form>

        {/* Code chips for browsing */}
        <div className="flex gap-2 px-6 py-3 border-b border-slate-100 overflow-x-auto">
          {codes.map(c => (
            <button
              key={c.id}
              onClick={() => handleBrowse(c.id)}
              className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                mode === 'browse' && selectedCode === c.id
                  ? 'bg-[#7B1F34] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {c.name}
              {c.articles_count > 0 && <span className="ml-1 opacity-60">({c.articles_count})</span>}
            </button>
          ))}
        </div>

        {/* Article detail viewer */}
        {selectedArticle && (
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 max-h-[40vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-3">
              <div>
                <span className="inline-block rounded bg-[#7B1F34] px-2 py-0.5 text-xs font-medium text-white mr-2">
                  Art. {selectedArticle.article_number}
                </span>
                <span className="text-xs text-slate-500">{selectedArticle.legislation_codes?.name || codeName(selectedArticle.code_id)}</span>
                {selectedArticle.article_title && (
                  <p className="mt-1 text-sm font-semibold text-slate-800">{selectedArticle.article_title}</p>
                )}
              </div>
              <div className="flex gap-1">
                <button onClick={() => handleCopy(selectedArticle.article_text, 'art-text')} className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-white hover:text-[#7B1F34]">
                  {copiedId === 'art-text' ? 'Copiato!' : 'Copia'}
                </button>
                <button onClick={() => setSelectedArticle(null)} className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-white hover:text-slate-600">Chiudi</button>
              </div>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{selectedArticle.article_text}</p>
            {/* Actions bar */}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <button
                onClick={() => handleCopy(formatCitation(selectedArticle), 'citation')}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-[#7B1F34] hover:text-[#7B1F34]"
              >
                {copiedId === 'citation' ? 'Copiato!' : 'Copia citazione'}
              </button>
              <button
                onClick={() => handleCopy(`${formatCitation(selectedArticle)}\n\n${selectedArticle.article_text}`, 'full')}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-[#7B1F34] hover:text-[#7B1F34]"
              >
                {copiedId === 'full' ? 'Copiato!' : 'Copia testo completo'}
              </button>
              {selectedArticle.normattiva_url && (
                <a href={selectedArticle.normattiva_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-[#7B1F34] hover:text-[#7B1F34]">
                  Normattiva
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
              )}
            </div>

            {/* Nearby articles navigation */}
            {nearbyArticles.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-200">
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-2">Articoli vicini</p>
                <div className="flex gap-1 flex-wrap">
                  {nearbyArticles.map(na => (
                    <button
                      key={na.id}
                      onClick={() => handleViewArticle(selectedArticle.code_id, na.article_number)}
                      className={`rounded px-2 py-0.5 text-[11px] transition ${
                        na.article_number === selectedArticle.article_number
                          ? 'bg-[#7B1F34] text-white font-bold'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {na.article_number}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">{error}</div>}

          {/* Search results with Genera Memo */}
          {mode === 'search' && results.length > 0 && (
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs text-slate-500">{results.length} risultati</p>
              <button onClick={handleGenerateMemo} disabled={isGenerating} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#7B1F34] to-[#9E3A50] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow-md disabled:opacity-50">
                {isGenerating ? 'Generazione...' : 'Genera Memo Legale'}
              </button>
            </div>
          )}

          {/* Memo viewer */}
          {showMemo && (
            <div ref={memoRef} className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 bg-[#7B1F34] px-4 py-3 rounded-t-xl">
                <span className="text-sm font-semibold text-white">{query}</span>
                <div className="flex gap-1">
                  {memoText && !isGenerating && (
                    <>
                      <button onClick={() => handleCopy(memoText, 'memo')} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white" title="Copia">{copiedId === 'memo' ? 'Copiato!' : '📋'}</button>
                      <button onClick={() => exportToWord({ title: `Memo: ${query}`, content: memoText, filename: `memo_legale_${query.replace(/\s+/g, '_').slice(0, 30)}.docx` })} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white" title="Word">📄</button>
                    </>
                  )}
                  <button onClick={() => { setShowMemo(false); setMemoText('') }} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white">✕</button>
                </div>
              </div>
              <div className="px-4 py-3 text-sm text-slate-700 leading-relaxed max-h-[50vh] overflow-y-auto whitespace-pre-line">
                {memoText || <span className="text-slate-400">Generazione in corso...</span>}
                {isGenerating && <span className="inline-block w-1 h-4 bg-[#7B1F34] animate-pulse ml-0.5" />}
              </div>
            </div>
          )}

          {/* Results list */}
          <div className="space-y-3">
            {(mode === 'search' ? results : browseArticles).map((article) => (
              <button
                key={article.id}
                type="button"
                onClick={() => handleViewArticle(article.code_id, article.article_number)}
                className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-[#7B1F34]/30 hover:shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                    Art. {article.article_number}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {article.code_name && <span className="text-[10px] font-medium text-[#7B1F34] uppercase">{article.code_name}</span>}
                      {article.article_title && <span className="text-sm font-medium text-slate-800 truncate">{article.article_title}</span>}
                    </div>
                    {article.book && <p className="mt-0.5 text-[11px] text-slate-400 truncate">{article.book}{article.title ? ` › ${article.title}` : ''}</p>}
                    {article.article_text && <p className="mt-1.5 text-xs text-slate-500 line-clamp-2">{article.article_text.slice(0, 200)}...</p>}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Browse pagination */}
          {mode === 'browse' && browseTotal > 50 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                disabled={browseOffset === 0}
                onClick={() => handleBrowse(selectedCode, Math.max(0, browseOffset - 50))}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-30"
              >
                ← Precedenti
              </button>
              <span className="text-xs text-slate-400">{browseOffset + 1}–{Math.min(browseOffset + 50, browseTotal)} di {browseTotal}</span>
              <button
                disabled={browseOffset + 50 >= browseTotal}
                onClick={() => handleBrowse(selectedCode, browseOffset + 50)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-30"
              >
                Successivi →
              </button>
            </div>
          )}

          {/* Empty state */}
          {!isSearching && results.length === 0 && browseArticles.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-8 w-8 text-slate-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-slate-700">Cerca nella Legislazione</h3>
              <p className="mt-1 text-xs text-slate-500 max-w-xs">
                Cerca per parola chiave o clicca su un codice per navigarlo
              </p>
            </div>
          )}

          {loadingArticle && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-[#7B1F34]" />
            </div>
          )}
        </div>
      </div>
      <div className="flex-1" onClick={onClose} />
    </div>
  )
}
