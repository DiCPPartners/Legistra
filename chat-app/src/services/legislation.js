/**
 * Servizio per ricerca nella legislazione italiana
 * Fonte: database locale Supabase con ricerca full-text istantanea
 */

const API_BASE = import.meta.env.DEV
  ? '/api/legislation'
  : (import.meta.env.VITE_API_URL || '') + '/api/legislation'

/**
 * Ottieni la lista dei codici disponibili
 */
export async function getCodes() {
  const res = await fetch(`${API_BASE}/codes`)
  if (!res.ok) return []
  return await res.json()
}

/**
 * Ricerca full-text istantanea negli articoli di legge
 * @param {string} query - Termini di ricerca
 * @param {string} [codeFilter] - Filtra per codice (cc, cp, cpc, cpp, cost)
 * @param {number} [limit=20]
 * @param {number} [offset=0]
 */
export async function searchLegislation(query, codeFilter = null, limit = 20, offset = 0) {
  if (!query?.trim()) return { results: [], count: 0 }

  const params = new URLSearchParams({ q: query.trim(), limit, offset })
  if (codeFilter) params.set('code', codeFilter)

  const res = await fetch(`${API_BASE}/search?${params}`)
  if (!res.ok) return { results: [], count: 0 }
  return await res.json()
}

/**
 * Recupera un singolo articolo
 */
export async function getArticle(codeId, articleNumber) {
  const res = await fetch(`${API_BASE}/article/${codeId}/${articleNumber}`)
  if (!res.ok) return null
  return await res.json()
}

/**
 * Naviga gli articoli di un codice
 */
export async function browseCode(codeId, filters = {}) {
  const params = new URLSearchParams()
  if (filters.book) params.set('book', filters.book)
  if (filters.title) params.set('title', filters.title)
  if (filters.limit) params.set('limit', filters.limit)
  if (filters.offset) params.set('offset', filters.offset)

  const res = await fetch(`${API_BASE}/browse/${codeId}?${params}`)
  if (!res.ok) return { articles: [], total: 0 }
  return await res.json()
}

/**
 * Ottieni la struttura gerarchica di un codice
 */
export async function getCodeStructure(codeId) {
  const res = await fetch(`${API_BASE}/structure/${codeId}`)
  if (!res.ok) return []
  return await res.json()
}

/**
 * Cerca norme rilevanti per il contesto di una domanda in chat.
 */
export async function searchLegislationForContext(question) {
  try {
    const { results } = await searchLegislation(question, null, 5)

    if (!results || results.length === 0) return null

    const contextLines = results.map((a, i) =>
      `[${i + 1}] Art. ${a.article_number} ${a.code_name || ''} - ${a.article_title || ''}` +
      `\nTesto: ${(a.article_text || '').slice(0, 500)}` +
      (a.normattiva_url ? `\nNormattiva: ${a.normattiva_url}` : '')
    )

    return {
      text: `<legal_context>\nNorme italiane rilevanti (usa come riferimento normativo, cita solo se utile):\n\n${contextLines.join('\n\n')}\n</legal_context>`,
      articles: results,
    }
  } catch (error) {
    console.warn('Errore ricerca legislazione per contesto:', error)
    return null
  }
}

/**
 * Articoli vicini (prima e dopo) a un dato articolo
 */
export async function getNearbyArticles(codeId, articleNumber, range = 5) {
  const res = await fetch(`${API_BASE}/nearby/${codeId}/${articleNumber}?range=${range}`)
  if (!res.ok) return []
  return await res.json()
}

/**
 * Lookup rapido: parsa input tipo "2043 cc" o "art. 142 cpp" e restituisce l'articolo
 */
export async function quickLookup(input) {
  if (!input?.trim()) return null

  const clean = input.trim().toLowerCase()
    .replace(/^art\.?\s*/i, '')
    .replace(/\s+/g, ' ')

  const codeAliases = {
    'cc': 'cc', 'c.c.': 'cc', 'c.c': 'cc', 'civile': 'cc', 'codice civile': 'cc',
    'cp': 'cp', 'c.p.': 'cp', 'c.p': 'cp', 'penale': 'cp', 'codice penale': 'cp',
    'cpc': 'cpc', 'c.p.c.': 'cpc', 'c.p.c': 'cpc', 'procedura civile': 'cpc',
    'cpp': 'cpp', 'c.p.p.': 'cpp', 'c.p.p': 'cpp', 'procedura penale': 'cpp',
    'cost': 'cost', 'costituzione': 'cost',
  }

  // Pattern: "2043 cc" or "2043 c.c." or "142 cpp"
  const match = clean.match(/^(\d+(?:\s*bis|ter|quater)?)\s+(.+)$/)
    || clean.match(/^(.+?)\s+(\d+(?:\s*bis|ter|quater)?)$/)

  if (!match) return null

  let artNum, codeStr
  if (/^\d/.test(match[1])) {
    artNum = match[1].trim()
    codeStr = match[2].trim()
  } else {
    codeStr = match[1].trim()
    artNum = match[2].trim()
  }

  const codeId = codeAliases[codeStr]
  if (!codeId) return null

  return await getArticle(codeId, artNum)
}

export default {
  getCodes,
  searchLegislation,
  getArticle,
  browseCode,
  getCodeStructure,
  searchLegislationForContext,
  getNearbyArticles,
  quickLookup,
}
