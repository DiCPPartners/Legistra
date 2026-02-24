/**
 * API veloce per consultazione legislazione italiana
 * Usa PostgreSQL full-text search su Supabase per risultati istantanei
 */

import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { createContextLogger } from '../services/logger.js'

const router = express.Router()
const log = createContextLogger('Legislation')

const sortByArticleNumber = (a, b) => {
  const numA = parseInt(a.article_number) || 0
  const numB = parseInt(b.article_number) || 0
  if (numA !== numB) return numA - numB
  return (a.article_number || '').localeCompare(b.article_number || '')
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
)

/**
 * GET /api/legislation/codes
 * Lista di tutti i codici disponibili
 */
router.get('/codes', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('legislation_codes')
      .select('*')
      .order('name')

    if (error) throw error
    res.json(data)
  } catch (error) {
    log.error('Codes list failed', { error: error.message })
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/legislation/search?q=risarcimento+danno&code=cc&limit=20&offset=0
 * Ricerca full-text istantanea negli articoli
 */
router.get('/search', async (req, res) => {
  const { q, code, limit = 20, offset = 0 } = req.query

  if (!q?.trim()) {
    return res.status(400).json({ error: 'Parametro q richiesto' })
  }

  try {
    const { data, error } = await supabase.rpc('search_legislation', {
      query_text: q.trim(),
      code_filter: code || null,
      limit_count: Math.min(parseInt(limit) || 20, 50),
      offset_count: parseInt(offset) || 0,
    })

    if (error) throw error

    log.info('Search', { query: q, code, results: data?.length || 0 })
    res.json({
      results: data || [],
      query: q,
      code: code || null,
      count: data?.length || 0,
    })
  } catch (error) {
    log.error('Search failed', { query: q, error: error.message })
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/legislation/article/:codeId/:articleNumber
 * Recupera un singolo articolo per codice e numero
 */
router.get('/article/:codeId/:articleNumber', async (req, res) => {
  const { codeId, articleNumber } = req.params

  try {
    const { data, error } = await supabase
      .from('legislation_articles')
      .select('*, legislation_codes(name, full_name)')
      .eq('code_id', codeId)
      .eq('article_number', articleNumber)
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Articolo non trovato' })

    res.json(data)
  } catch (error) {
    log.error('Article fetch failed', { codeId, articleNumber, error: error.message })
    res.status(error.code === 'PGRST116' ? 404 : 500).json({ error: 'Articolo non trovato' })
  }
})

/**
 * GET /api/legislation/browse/:codeId?book=...&title=...&limit=50&offset=0
 * Naviga gli articoli di un codice con filtri strutturali
 */
router.get('/browse/:codeId', async (req, res) => {
  const { codeId } = req.params
  const { book, title, chapter, limit = 50, offset = 0 } = req.query

  try {
    let query = supabase
      .from('legislation_articles')
      .select('id, article_number, article_title, book, title, chapter, section', { count: 'exact' })
      .eq('code_id', codeId)

    if (book) query = query.eq('book', book)
    if (title) query = query.eq('title', title)
    if (chapter) query = query.eq('chapter', chapter)

    const { data, error, count } = await query

    if (error) throw error

    const sorted = (data || []).sort(sortByArticleNumber)
    const off = parseInt(offset) || 0
    const lim = parseInt(limit) || 50
    const paged = sorted.slice(off, off + lim)

    res.json({
      articles: paged,
      total: count || 0,
      code: codeId,
    })
  } catch (error) {
    log.error('Browse failed', { codeId, error: error.message })
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/legislation/structure/:codeId
 * Struttura gerarchica di un codice (libri, titoli, capi)
 */
router.get('/structure/:codeId', async (req, res) => {
  const { codeId } = req.params

  try {
    const { data, error } = await supabase
      .from('legislation_articles')
      .select('article_number, book, title, chapter, section')
      .eq('code_id', codeId)

    if (error) throw error

    const structure = {}
    for (const row of data || []) {
      const b = row.book || 'Disposizioni generali'
      if (!structure[b]) structure[b] = {}
      const t = row.title || ''
      if (t && !structure[b][t]) structure[b][t] = new Set()
      if (row.chapter) structure[b][t]?.add(row.chapter)
    }

    const result = Object.entries(structure).map(([book, titles]) => ({
      book,
      titles: Object.entries(titles).map(([title, chapters]) => ({
        title,
        chapters: [...chapters],
      })),
    }))

    res.json(result)
  } catch (error) {
    log.error('Structure failed', { codeId, error: error.message })
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/legislation/nearby/:codeId/:articleNumber?range=5
 * Articoli vicini (prima e dopo) a un dato articolo
 */
router.get('/nearby/:codeId/:articleNumber', async (req, res) => {
  const { codeId, articleNumber } = req.params
  const range = Math.min(parseInt(req.query.range) || 5, 20)

  try {
    const artNum = parseInt(articleNumber)

    const { data, error } = await supabase
      .from('legislation_articles')
      .select('id, article_number, article_title, book, title, chapter')
      .eq('code_id', codeId)

    if (error) throw error

    const sorted = (data || []).sort(sortByArticleNumber)
    const currentIdx = sorted.findIndex(a => parseInt(a.article_number) === artNum || a.article_number === articleNumber)
    const start = Math.max(0, currentIdx - range)
    const end = Math.min(sorted.length, currentIdx + range + 1)
    
    res.json(sorted.slice(start, end))
  } catch (error) {
    log.error('Nearby failed', { codeId, articleNumber, error: error.message })
    res.status(500).json({ error: error.message })
  }
})

export default router
