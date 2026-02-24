/**
 * Servizio per ricerca nella legislazione italiana
 * Utilizza OpenAI per identificare norme rilevanti e costruisce link a Normattiva.it
 */

const NORMATTIVA_BASE = 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato'

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
 * Costruisce URL di ricerca testuale su Normattiva
 */
function buildNormattivaSearchUrl(query) {
  return `https://www.normattiva.it/ricerca/semplice?query=${encodeURIComponent(query)}`
}

/**
 * Cerca norme italiane rilevanti per una query usando AI.
 * @param {string} query - Termini di ricerca
 * @param {string} apiKey - OpenAI API key
 * @param {number} maxResults - Numero massimo di risultati (default 5)
 * @returns {Promise<{articles: Array, totalCount: number}>}
 */
export async function searchLegislation(query, apiKey, maxResults = 5) {
  if (!query?.trim()) return { articles: [], totalCount: 0 }

  if (!apiKey) {
    return { articles: [], totalCount: 0, error: 'API key richiesta' }
  }

  try {
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
  "source": "Gazzetta Ufficiale o fonte",
  "keywords": ["parola chiave 1", "parola chiave 2"]
}

Rispondi SOLO con il JSON array valido, niente altro. Se non trovi norme rilevanti, rispondi con [].
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
    if (!jsonMatch) return { articles: [], totalCount: 0 }

    const rawResults = JSON.parse(jsonMatch[0])

    const articles = rawResults.map((item, idx) => {
      const normattivaUrl = buildNormattivaUrl(item.type, item.date, item.number)
      const searchUrl = buildNormattivaSearchUrl(`${item.type} ${item.number} ${item.date}`)

      return {
        id: `law-${idx}-${item.number}`,
        type: item.type,
        number: item.number,
        date: item.date,
        title: item.title,
        articles: item.articles || '',
        summary: item.summary || '',
        source: item.source || 'Normattiva',
        keywords: item.keywords || [],
        url: normattivaUrl || searchUrl,
        searchUrl,
        citation: formatLegalCitation(item),
      }
    })

    return { articles, totalCount: articles.length }

  } catch (error) {
    console.warn('Errore ricerca legislazione:', error)
    return { articles: [], totalCount: 0, error: error.message }
  }
}

/**
 * Formatta una citazione legale italiana
 */
function formatLegalCitation(item) {
  let cite = item.type
  if (item.date) {
    const d = new Date(item.date)
    const day = d.getDate()
    const months = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre']
    const month = months[d.getMonth()]
    const year = d.getFullYear()
    cite += ` ${day} ${month} ${year}`
  }
  if (item.number) cite += `, n. ${item.number}`
  if (item.title) cite += ` - "${item.title}"`
  if (item.articles) cite += ` (${item.articles})`
  return cite
}

/**
 * Recupera dettagli per una lista di norme (identificate da id o ref).
 * Per la legislazione, restituisce gli articoli se già presenti come oggetti completi.
 * @param {Array<string|object>} articleRefs - Array di ID o oggetti articolo
 * @returns {Promise<Array>}
 */
export async function fetchArticleDetails(articleRefs) {
  if (!articleRefs?.length) return []
  // Se sono già oggetti articolo completi, restituiscili
  if (typeof articleRefs[0] === 'object' && articleRefs[0]?.url) {
    return articleRefs
  }
  // Se sono ID, non abbiamo un API per fetch - ritorna vuoto
  return []
}

/**
 * Converte una domanda utente in una query di ricerca legislativa ottimizzata.
 */
export async function buildSearchQuery(question, apiKey) {
  if (!apiKey || !question?.trim()) return question

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 150,
        messages: [
          {
            role: 'system',
            content: 'Converti la domanda in una query di ricerca per la legislazione italiana. Restituisci SOLO i termini di ricerca in italiano, includendo riferimenti normativi specifici se possibile. Nessun commento.'
          },
          { role: 'user', content: question }
        ]
      })
    })

    if (!res.ok) return question
    const data = await res.json()
    return data.choices?.[0]?.message?.content?.trim() || question
  } catch {
    return question
  }
}

/**
 * Cerca norme rilevanti per il contesto di una domanda.
 * Restituisce un testo formattato da inserire come contesto nell'AI.
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
  buildSearchQuery,
  searchLegislationForContext
}
