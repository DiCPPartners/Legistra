/**
 * Route proxy per Normattiva.it
 * Permette al frontend di cercare e consultare la legislazione italiana
 */

import express from 'express'
import { createContextLogger } from '../services/logger.js'

const router = express.Router()
const log = createContextLogger('Normattiva')

const NORMATTIVA_BASE = 'https://www.normattiva.it'
const USER_AGENT = 'Mozilla/5.0 (compatible; Legistra/1.0; +https://legistra.app)'

/**
 * GET /api/normattiva/search?q=responsabilità+contrattuale
 * Ricerca testuale su Normattiva
 */
router.get('/search', async (req, res) => {
  const { q } = req.query
  if (!q?.trim()) {
    return res.status(400).json({ error: 'Parametro q richiesto' })
  }

  try {
    const searchUrl = `${NORMATTIVA_BASE}/ricerca/semplice`
    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
        'Accept': 'text/html',
      },
      body: new URLSearchParams({ query: q }),
    })

    if (!response.ok) {
      throw new Error(`Normattiva returned ${response.status}`)
    }

    const html = await response.text()
    const results = parseSearchResults(html)

    log.info('Search completed', { query: q, results: results.length })
    res.json({ results, totalCount: results.length, query: q })

  } catch (error) {
    log.error('Search failed', { query: q, error: error.message })
    res.status(502).json({ error: 'Errore nella ricerca su Normattiva', details: error.message })
  }
})

/**
 * GET /api/normattiva/atto?urn=urn:nir:stato:legge:2017-03-08;24
 * Recupera il testo di un atto specifico tramite URN
 */
router.get('/atto', async (req, res) => {
  const { urn } = req.query
  if (!urn?.trim()) {
    return res.status(400).json({ error: 'Parametro urn richiesto' })
  }

  try {
    const url = `${NORMATTIVA_BASE}/uri-res/N2Ls?${urn}`
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html',
      },
    })

    if (!response.ok) {
      throw new Error(`Normattiva returned ${response.status}`)
    }

    const html = await response.text()
    const atto = parseAtto(html)

    log.info('Atto fetched', { urn, title: atto.title?.slice(0, 50) })
    res.json(atto)

  } catch (error) {
    log.error('Atto fetch failed', { urn, error: error.message })
    res.status(502).json({ error: 'Errore nel recupero dell\'atto', details: error.message })
  }
})

/**
 * GET /api/normattiva/articolo?codice=civile&articolo=2043
 * Shortcut per consultare un articolo di un codice
 */
router.get('/articolo', async (req, res) => {
  const { codice, articolo } = req.query
  if (!codice || !articolo) {
    return res.status(400).json({ error: 'Parametri codice e articolo richiesti' })
  }

  const codiceMap = {
    'civile': 'urn:nir:stato:regio.decreto:1942-03-16;262',
    'penale': 'urn:nir:stato:regio.decreto:1930-10-19;1398',
    'procedura-civile': 'urn:nir:stato:regio.decreto:1940-10-28;1443',
    'procedura-penale': 'urn:nir:stato:decreto.del.presidente.della.repubblica:1988-09-22;447',
  }

  const urnBase = codiceMap[codice.toLowerCase()]
  if (!urnBase) {
    return res.status(400).json({
      error: `Codice non riconosciuto: ${codice}`,
      codiciDisponibili: Object.keys(codiceMap),
    })
  }

  const urn = `${urnBase}~art${articolo}`

  try {
    const url = `${NORMATTIVA_BASE}/uri-res/N2Ls?${urn}`
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html',
      },
    })

    if (!response.ok) {
      throw new Error(`Normattiva returned ${response.status}`)
    }

    const html = await response.text()
    const content = parseArticolo(html, articolo)

    log.info('Articolo fetched', { codice, articolo })
    res.json({
      codice,
      articolo,
      urn,
      url: `${NORMATTIVA_BASE}/uri-res/N2Ls?${urn}`,
      ...content,
    })

  } catch (error) {
    log.error('Articolo fetch failed', { codice, articolo, error: error.message })
    res.status(502).json({ error: 'Errore nel recupero dell\'articolo', details: error.message })
  }
})

// ===== PARSING FUNCTIONS =====

function parseSearchResults(html) {
  const results = []

  const itemRegex = /<div[^>]*class="[^"]*risultato[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi
  const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
  const titleRegex = /(?:LEGGE|DECRETO\s+LEGISLATIVO|DECRETO[\s-]+LEGGE|DECRETO\s+DEL\s+PRESIDENTE|REGIO\s+DECRETO|D\.Lgs\.|D\.L\.)\s+\d{1,2}\s+\w+\s+\d{4},?\s*n\.\s*\d+/gi

  const titles = html.match(titleRegex) || []
  const urnLinks = [...html.matchAll(/href="\/uri-res\/N2Ls\?([^"]+)"/g)]

  for (let i = 0; i < Math.min(titles.length, 20); i++) {
    const title = titles[i]?.trim()
    const urn = urnLinks[i]?.[1] || ''
    const url = urn ? `${NORMATTIVA_BASE}/uri-res/N2Ls?${urn}` : ''

    if (title) {
      const parsed = parseLawReference(title)
      results.push({
        id: `normattiva-${i}`,
        title,
        url,
        urn,
        ...parsed,
      })
    }
  }

  return results
}

function parseLawReference(text) {
  const match = text.match(
    /(?:(LEGGE|DECRETO\s+LEGISLATIVO|DECRETO[\s-]+LEGGE|DECRETO\s+DEL\s+PRESIDENTE\s+DELLA\s+REPUBBLICA|REGIO\s+DECRETO|D\.Lgs\.|D\.L\.)\s+)?(\d{1,2})\s+(\w+)\s+(\d{4}),?\s*n\.\s*(\d+)/i
  )

  if (!match) return { type: 'Atto', number: '', date: '' }

  const typeMap = {
    'legge': 'Legge',
    'decreto legislativo': 'Decreto Legislativo',
    'decreto-legge': 'Decreto Legge',
    'decreto legge': 'Decreto Legge',
    'd.lgs.': 'Decreto Legislativo',
    'd.l.': 'Decreto Legge',
    'decreto del presidente della repubblica': 'DPR',
    'regio decreto': 'Regio Decreto',
  }

  const monthMap = {
    'gennaio': '01', 'febbraio': '02', 'marzo': '03', 'aprile': '04',
    'maggio': '05', 'giugno': '06', 'luglio': '07', 'agosto': '08',
    'settembre': '09', 'ottobre': '10', 'novembre': '11', 'dicembre': '12',
  }

  const type = typeMap[(match[1] || '').toLowerCase().trim()] || match[1] || 'Atto'
  const day = match[2].padStart(2, '0')
  const month = monthMap[match[3].toLowerCase()] || '01'
  const year = match[4]
  const number = match[5]

  return {
    type,
    number,
    date: `${year}-${month}-${day}`,
  }
}

function parseAtto(html) {
  const titleMatch = html.match(/##\s*(.+?)(?:\s*--|$)/m)
  const subtitleMatch = html.match(/###\s*(.+?)(?:\s*\(|$)/m)

  const bodyStart = html.indexOf('Art.')
  const bodyEnd = html.lastIndexOf('note:')
  const body = bodyStart > 0
    ? html.slice(bodyStart, bodyEnd > bodyStart ? bodyEnd : undefined).slice(0, 50000)
    : ''

  const articles = [...body.matchAll(/(?:^|\n)\s*(Art\.\s*\d+[\s\S]*?)(?=\nArt\.\s*\d+|\n##|\n###|$)/g)]
    .map(m => m[1].trim())
    .slice(0, 100)

  return {
    title: titleMatch?.[1]?.trim() || '',
    subtitle: subtitleMatch?.[1]?.trim() || '',
    articlesCount: articles.length,
    articles,
    rawText: body.slice(0, 100000),
  }
}

function parseArticolo(html, targetArticolo) {
  const artPattern = new RegExp(
    `(?:^|\\n)\\s*(Art\\.\\s*${targetArticolo}[\\s\\S]*?)(?=\\nArt\\.\\s*\\d|\\n##|\\n###|$)`,
    'm'
  )
  const match = html.match(artPattern)

  const titleMatch = html.match(/##\s*(.+?)(?:\s*--|$)/m)

  return {
    title: titleMatch?.[1]?.trim() || '',
    text: match?.[1]?.trim() || `Articolo ${targetArticolo} non trovato nel testo dell'atto.`,
  }
}

export default router
