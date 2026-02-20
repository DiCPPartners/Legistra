/**
 * Servizio per interagire con le API PubMed E-utilities (gratuite)
 * Docs: https://www.ncbi.nlm.nih.gov/books/NBK25497/
 */

const BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
const TOOL_NAME = 'mymed-app'
const TOOL_EMAIL = 'support@mymed.app'

function buildParams(extra = {}) {
  const params = new URLSearchParams({
    tool: TOOL_NAME,
    email: TOOL_EMAIL,
    ...extra,
  })
  return params.toString()
}

/**
 * Cerca articoli su PubMed e restituisce dettagli completi.
 * @param {string} query - Termini di ricerca
 * @param {number} maxResults - Numero massimo di risultati (default 5)
 * @returns {Promise<Array<{pmid, title, authors, year, journal, abstract, doi, url}>>}
 */
export async function searchPubMed(query, maxResults = 5) {
  if (!query?.trim()) return { articles: [], totalCount: 0 }

  // Step 1: ESearch - ottieni lista PMID
  const searchParams = buildParams({
    db: 'pubmed',
    term: query,
    retmax: maxResults,
    sort: 'relevance',
    retmode: 'json',
  })

  const searchRes = await fetch(`${BASE_URL}/esearch.fcgi?${searchParams}`)
  if (!searchRes.ok) throw new Error(`PubMed search failed: ${searchRes.status}`)

  const searchData = await searchRes.json()
  const pmids = searchData?.esearchresult?.idlist || []
  const totalCount = parseInt(searchData?.esearchresult?.count || '0', 10)

  if (pmids.length === 0) return { articles: [], totalCount }

  // Step 2: EFetch - ottieni dettagli articoli
  const articles = await fetchArticleDetails(pmids)
  return { articles, totalCount }
}

/**
 * Recupera dettagli completi per una lista di PMID.
 * @param {string[]} pmids - Array di PubMed ID
 * @returns {Promise<Array>}
 */
export async function fetchArticleDetails(pmids) {
  if (!pmids?.length) return []

  const fetchParams = buildParams({
    db: 'pubmed',
    id: pmids.join(','),
    retmode: 'xml',
    rettype: 'abstract',
  })

  const res = await fetch(`${BASE_URL}/efetch.fcgi?${fetchParams}`)
  if (!res.ok) throw new Error(`PubMed fetch failed: ${res.status}`)

  const xml = await res.text()
  return parseArticlesXml(xml)
}

/**
 * Parse XML di PubMed efetch e restituisce array di articoli strutturati.
 */
function parseArticlesXml(xml) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')
  const articles = doc.querySelectorAll('PubmedArticle')
  const results = []

  for (const article of articles) {
    try {
      const pmid = getText(article, 'PMID')
      const title = getText(article, 'ArticleTitle')

      // Autori
      const authorNodes = article.querySelectorAll('Author')
      const authors = []
      for (const a of authorNodes) {
        const last = getText(a, 'LastName')
        const initials = getText(a, 'Initials')
        if (last) authors.push(initials ? `${last} ${initials}` : last)
      }

      // Anno
      const year = getText(article, 'PubDate > Year') ||
                   getText(article, 'ArticleDate > Year') ||
                   getText(article, 'MedlineDate')?.slice(0, 4) || ''

      // Journal
      const journal = getText(article, 'Journal > Title') ||
                      getText(article, 'ISOAbbreviation') || ''

      // Abstract
      const abstractParts = article.querySelectorAll('AbstractText')
      let abstract = ''
      for (const part of abstractParts) {
        const label = part.getAttribute('Label')
        const text = part.textContent?.trim() || ''
        if (label) {
          abstract += `${label}: ${text}\n`
        } else {
          abstract += text + '\n'
        }
      }
      abstract = abstract.trim()

      // DOI
      const idNodes = article.querySelectorAll('ArticleId')
      let doi = ''
      for (const idNode of idNodes) {
        if (idNode.getAttribute('IdType') === 'doi') {
          doi = idNode.textContent?.trim() || ''
          break
        }
      }

      // Volume, Issue, Pages
      const volume = getText(article, 'Volume')
      const issue = getText(article, 'Issue')
      const pages = getText(article, 'MedlinePgn')

      results.push({
        pmid,
        title,
        authors,
        authorsShort: authors.length > 3
          ? `${authors[0]} et al.`
          : authors.join(', '),
        year,
        journal,
        volume,
        issue,
        pages,
        abstract,
        doi,
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        citation: formatCitation({ authors, title, journal, year, volume, issue, pages, doi }),
      })
    } catch (e) {
      console.warn('Errore parsing articolo PubMed:', e)
    }
  }

  return results
}

function getText(parent, selector) {
  return parent.querySelector(selector)?.textContent?.trim() || ''
}

/**
 * Formatta una citazione in stile Vancouver
 */
function formatCitation({ authors, title, journal, year, volume, issue, pages, doi }) {
  const authStr = authors.length > 6
    ? authors.slice(0, 6).join(', ') + ', et al.'
    : authors.join(', ')

  let cite = `${authStr}. ${title}`
  if (!cite.endsWith('.')) cite += '.'
  cite += ` ${journal}. ${year}`
  if (volume) {
    cite += `;${volume}`
    if (issue) cite += `(${issue})`
    if (pages) cite += `:${pages}`
  }
  cite += '.'
  if (doi) cite += ` doi:${doi}`

  return cite
}

/**
 * Converte una domanda utente in una query PubMed ottimizzata.
 * Usa l'AI per estrarre termini MeSH rilevanti.
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
            content: 'Converti la domanda in una query PubMed ottimizzata. Restituisci SOLO i termini di ricerca (in inglese), separati da AND/OR. Usa termini MeSH quando possibile. Nessun commento.'
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
 * Cerca articoli PubMed rilevanti per il contesto di una domanda.
 * Restituisce un testo formattato da inserire come contesto nell'AI.
 */
export async function searchPubMedForContext(question, apiKey) {
  try {
    const query = await buildSearchQuery(question, apiKey)
    const { articles } = await searchPubMed(query, 3)

    if (articles.length === 0) return null

    const contextLines = articles.map((a, i) =>
      `[${i + 1}] ${a.authorsShort} (${a.year}). "${a.title}" ${a.journal}. PMID: ${a.pmid}` +
      (a.abstract ? `\nAbstract: ${a.abstract.slice(0, 400)}` : '')
    )

    return {
      text: `<pubmed_context>\nArticoli scientifici rilevanti (usa come conoscenza di background, cita solo se utile):\n\n${contextLines.join('\n\n')}\n</pubmed_context>`,
      articles,
    }
  } catch (error) {
    console.warn('Errore ricerca PubMed per contesto:', error)
    return null
  }
}
