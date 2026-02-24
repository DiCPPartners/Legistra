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

export default {
  getCodes,
  searchLegislation,
  getArticle,
  browseCode,
  getCodeStructure,
  searchLegislationForContext,
}
