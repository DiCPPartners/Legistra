/**
 * Servizio per ricerca nella legislazione italiana
 * Fonte primaria: Normattiva.it (via backend proxy)
 * Fallback: OpenAI per identificazione norme
 */

const NORMATTIVA_BASE = 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato'

const API_BASE = import.meta.env.DEV
  ? '/api/normattiva'
  : (import.meta.env.VITE_API_URL || '') + '/api/normattiva'

/**
 * Costruisce URL Normattiva per un atto normativo
 */
function buildNormattivaUrl(type, date, number) {
  if (!type || !date || !number) return null

  const typeMap = {
    'legge': 'legge',
    'decreto legislativo': 'decreto.legislativo',
    'decreto legge': 'decreto.legge',
    'decreto presidente repubblica': 'decreto.del.presidente.della.repubblica',
    'dpr': 'decreto.del.presidente.della.repubblica',
    'regio decreto': 'regio.decreto',
    'costituzione': 'costituzione',
    'codice civile': 'codice.civile',
    'codice penale': 'codice.penale',
    'codice procedura civile': 'codice.di.procedura.civile',
    'codice procedura penale': 'codice.di.procedura.penale',
  }

  const urnType = typeMap[type.toLowerCase()] || type.toLowerCase().replace(/\s+/g, '.')
  return `${NORMATTIVA_BASE}:${urnType}:${date};${number}`
}

/**
 * Formatta una citazione legale italiana
 */
function formatLegalCitation(item) {
  let cite = item.type
  if (item.date) {
    const d = new Date(item.date)
    if (!isNaN(d.getTime())) {
      const day = d.getDate()
      const months = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre']
      const month = months[d.getMonth()]
      const year = d.getFullYear()
      cite += ` ${day} ${month} ${year}`
    }
  }
  if (item.number) cite += `, n. ${item.number}`
  if (item.title) cite += ` - "${item.title}"`
  if (item.articles) cite += ` (${item.articles})`
  return cite
}

// ===== RICERCA PRIMARIA: Normattiva via backend =====

/**
 * Cerca su Normattiva via backend proxy
 */
async function searchNormattiva(query) {
  try {
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.results || []
  } catch {
    return null
  }
}

/**
 * Recupera un articolo specifico di un codice via backend
 */
export async function fetchArticolo(codice, articolo) {
  try {
    const res = await fetch(`${API_BASE}/articolo?codice=${encodeURIComponent(codice)}&articolo=${encodeURIComponent(articolo)}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Recupera un atto completo via URN dal backend
 */
export async function fetchAtto(urn) {
  try {
    const res = await fetch(`${API_BASE}/atto?urn=${encodeURIComponent(urn)}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// ===== RICERCA AI (fallback) =====

async function searchWithAI(query, apiKey, maxResults = 5) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 3000,
      messages: [
        {
          role: 'system',
          content: `Sei un esperto di diritto italiano. Data una query di ricerca, identifica le ${maxResults} norme italiane più rilevanti.

Per ogni norma, restituisci un JSON array con oggetti nel formato:
{
  "type": "tipo atto (es: Legge, Decreto Legislativo, Decreto Legge, DPR, Codice Civile, ecc.)",
  "number": "numero dell'atto",
  "date": "data in formato YYYY-MM-DD",
  "title": "titolo o denominazione ufficiale dell'atto",
  "articles": "articoli specifici rilevanti (es: art. 1218, artt. 2043-2059)",
  "summary": "breve spiegazione (2-3 frasi) di perché questa norma è rilevante per la query",
  "keywords": ["parola chiave 1", "parola chiave 2"]
}

Rispondi SOLO con il JSON array valido, niente altro.
Includi sia codici (civile, penale, procedura) che leggi speciali quando rilevanti.`
        },
        { role: 'user', content: query }
      ]
    })
  })

  if (!res.ok) throw new Error(`API error: ${res.status}`)

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content?.trim() || '[]'
  const jsonMatch = content.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []

  return JSON.parse(jsonMatch[0])
}

// ===== FUNZIONE PRINCIPALE =====

/**
 * Cerca norme italiane. Usa Normattiva come fonte primaria, AI come fallback.
 * @param {string} query - Termini di ricerca
 * @param {string} apiKey - OpenAI API key (per fallback AI)
 * @param {number} maxResults - Numero massimo di risultati
 * @returns {Promise<{articles: Array, totalCount: number, source: string}>}
 */
export async function searchLegislation(query, apiKey, maxResults = 10) {
  if (!query?.trim()) return { articles: [], totalCount: 0, source: 'none' }

  // 1. Prova Normattiva (dati reali)
  const normattivaResults = await searchNormattiva(query)

  if (normattivaResults && normattivaResults.length > 0) {
    const articles = normattivaResults.slice(0, maxResults).map((item, idx) => ({
      id: item.id || `normattiva-${idx}`,
      type: item.type || 'Atto',
      number: item.number || '',
      date: item.date || '',
      title: item.title || '',
      articles: item.articles || '',
      summary: '',
      url: item.url || '',
      urn: item.urn || '',
      citation: formatLegalCitation(item),
      source: 'normattiva',
    }))

    return { articles, totalCount: articles.length, source: 'normattiva' }
  }

  // 2. Fallback AI (se Normattiva non risponde o non trova risultati)
  if (!apiKey) {
    return { articles: [], totalCount: 0, source: 'none', error: 'Nessun risultato da Normattiva' }
  }

  try {
    const aiResults = await searchWithAI(query, apiKey, maxResults)

    const articles = aiResults.map((item, idx) => {
      const normattivaUrl = buildNormattivaUrl(item.type, item.date, item.number)
      return {
        id: `ai-${idx}-${item.number}`,
        type: item.type,
        number: item.number,
        date: item.date,
        title: item.title,
        articles: item.articles || '',
        summary: item.summary || '',
        keywords: item.keywords || [],
        url: normattivaUrl || `https://www.normattiva.it/ricerca/semplice?query=${encodeURIComponent(item.type + ' ' + item.number)}`,
        citation: formatLegalCitation(item),
        source: 'ai',
      }
    })

    return { articles, totalCount: articles.length, source: 'ai' }

  } catch (error) {
    console.warn('Errore ricerca legislazione AI:', error)
    return { articles: [], totalCount: 0, source: 'error', error: error.message }
  }
}

/**
 * Cerca norme rilevanti per il contesto di una domanda in chat.
 */
export async function searchLegislationForContext(question, apiKey) {
  try {
    const { articles } = await searchLegislation(question, apiKey, 3)

    if (articles.length === 0) return null

    const contextLines = articles.map((a, i) =>
      `[${i + 1}] ${a.citation}` +
      (a.summary ? `\nRilevanza: ${a.summary}` : '') +
      (a.url ? `\nNormattiva: ${a.url}` : '')
    )

    return {
      text: `<legal_context>\nNorme italiane rilevanti (usa come riferimento normativo, cita solo se utile):\n\n${contextLines.join('\n\n')}\n</legal_context>`,
      articles,
    }
  } catch (error) {
    console.warn('Errore ricerca legislazione per contesto:', error)
    return null
  }
}

export default {
  searchLegislation,
  searchLegislationForContext,
  fetchArticolo,
  fetchAtto,
}
