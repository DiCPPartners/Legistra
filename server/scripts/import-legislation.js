#!/usr/bin/env node

/**
 * Importa i Codici italiani da Normattiva nel database Supabase.
 * Scarica ogni articolo singolarmente via URN per ottenere il testo ufficiale.
 * 
 * Usage: node scripts/import-legislation.js [--all] [cc|cp|cpc|cpp|cost]
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '../../chat-app/.env') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const CODES = {
  cost: { name: 'Costituzione', urn: 'urn:nir:stato:costituzione:1947-12-27', maxArt: 139 },
  cc:   { name: 'Codice Civile', urn: 'urn:nir:stato:regio.decreto:1942-03-16;262', maxArt: 2969 },
  cp:   { name: 'Codice Penale', urn: 'urn:nir:stato:regio.decreto:1930-10-19;1398', maxArt: 734 },
  cpc:  { name: 'Codice di Procedura Civile', urn: 'urn:nir:stato:regio.decreto:1940-10-28;1443', maxArt: 840 },
  cpp:  { name: 'Codice di Procedura Penale', urn: 'urn:nir:stato:decreto.del.presidente.della.repubblica:1988-09-22;447', maxArt: 746 },
}

function decodeEntities(text) {
  return text
    .replace(/&egrave;/gi, 'è').replace(/&Egrave;/gi, 'È')
    .replace(/&agrave;/gi, 'à').replace(/&Agrave;/gi, 'À')
    .replace(/&ograve;/gi, 'ò').replace(/&Ograve;/gi, 'Ò')
    .replace(/&ugrave;/gi, 'ù').replace(/&Ugrave;/gi, 'Ù')
    .replace(/&igrave;/gi, 'ì').replace(/&Igrave;/gi, 'Ì')
    .replace(/&aacute;/gi, 'á').replace(/&eacute;/gi, 'é')
    .replace(/&oacute;/gi, 'ó').replace(/&uacute;/gi, 'ú')
    .replace(/&laquo;/gi, '«').replace(/&raquo;/gi, '»')
    .replace(/&quot;/gi, '"').replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ').replace(/&hellip;/gi, '…')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
}

function stripHtml(html) {
  return decodeEntities(
    html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
  ).replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

async function fetchArticle(urn, artNum) {
  const url = `https://www.normattiva.it/uri-res/N2Ls?${urn}~art${artNum}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
  })
  if (!res.ok) return null

  const html = await res.text()

  const numMatch = html.match(/class="article-num-akn"[^>]*>([\s\S]*?)<\/h2>/)
  if (!numMatch) return null

  const actualNum = stripHtml(numMatch[1]).replace(/Art\.\s*/, '').trim()

  const titleMatch = html.match(/class="article-heading-akn"[^>]*>([\s\S]*?)<\//)
    || html.match(/class="article-heading"[^>]*>([\s\S]*?)<\//)
  const articleTitle = titleMatch ? stripHtml(titleMatch[1]) : ''

  const textMatch = html.match(/class="art-just-text-akn">([\s\S]*?)<\/span>/s)
  if (!textMatch) return null

  const articleText = stripHtml(textMatch[1])
  if (!articleText || articleText.length < 2) return null

  // Extract structural info from the page sidebar
  let book = '', title = '', chapter = ''
  const structMatches = [...html.matchAll(/class="[^"]*(?:book-title|title-title|chapter-title)[^"]*"[^>]*>([\s\S]*?)<\/h2>/gi)]
  for (const m of structMatches) {
    const txt = stripHtml(m[1])
    if (/LIBRO/i.test(txt)) book = txt
    else if (/TITOLO/i.test(txt)) title = txt
    else if (/CAPO/i.test(txt)) chapter = txt
  }

  return {
    article_number: actualNum || String(artNum),
    article_title: articleTitle || null,
    article_text: articleText,
    book: book || null,
    title: title || null,
    chapter: chapter || null,
    section: null,
  }
}

async function importCode(codeId) {
  const code = CODES[codeId]
  if (!code) { console.error(`Codice sconosciuto: ${codeId}`); return 0 }

  console.log(`\n📚 ${code.name} (max ${code.maxArt} articoli)`)

  // Delete old data
  await supabase.from('legislation_articles').delete().eq('code_id', codeId)

  const articles = []
  let consecutive404 = 0
  const maxConsecutive404 = 20

  for (let artNum = 1; artNum <= code.maxArt + 50; artNum++) {
    try {
      const article = await fetchArticle(code.urn, artNum)

      if (article) {
        consecutive404 = 0
        articles.push({
          code_id: codeId,
          ...article,
          normattiva_url: `https://www.normattiva.it/uri-res/N2Ls?${code.urn}~art${artNum}`,
        })
        process.stdout.write(`\r  Scaricati: ${articles.length} articoli (art. ${artNum})`)
      } else {
        consecutive404++
        if (consecutive404 >= maxConsecutive404 && artNum > code.maxArt) break
      }

      // Rate limiting: 100ms between requests
      await new Promise(r => setTimeout(r, 100))

    } catch (err) {
      consecutive404++
      if (consecutive404 >= maxConsecutive404 && artNum > code.maxArt) break
    }
  }
  console.log()

  if (articles.length === 0) {
    console.warn('  ⚠ Nessun articolo trovato')
    return 0
  }

  console.log(`  Inserimento nel database...`)
  // Deduplica per article_number (tieni l'ultimo trovato)
  const deduped = new Map()
  for (const art of articles) {
    deduped.set(art.article_number, art)
  }
  const uniqueArticles = [...deduped.values()]
  console.log(`  Articoli unici (dopo deduplica): ${uniqueArticles.length}`)

  let inserted = 0
  for (const art of uniqueArticles) {
    const { error } = await supabase
      .from('legislation_articles')
      .upsert(art, { onConflict: 'code_id,article_number' })

    if (error) {
      // Ignora errori singoli, continua
    } else {
      inserted++
    }
    if (inserted % 100 === 0 || inserted === uniqueArticles.length) {
      process.stdout.write(`\r  Inseriti: ${inserted}/${uniqueArticles.length}`)
    }
  }
  console.log()

  await supabase
    .from('legislation_codes')
    .update({ articles_count: inserted, last_imported: new Date().toISOString() })
    .eq('id', codeId)

  console.log(`  ✓ ${code.name}: ${inserted} articoli`)
  return inserted
}

// Main
const args = process.argv.slice(2)
const codeArg = args.find(a => !a.startsWith('--'))
const doAll = args.includes('--all') || !codeArg

;(async () => {
  console.log('═══════════════════════════════════════')
  console.log('  Import Legislazione Italiana')
  console.log('═══════════════════════════════════════')

  let total = 0
  const toImport = doAll ? Object.keys(CODES) : [codeArg]

  for (const id of toImport) {
    try { total += await importCode(id) }
    catch (err) { console.error(`  ✗ ${id}:`, err.message) }
  }

  console.log(`\n═══════════════════════════════════════`)
  console.log(`  ✓ Completato: ${total} articoli totali`)
  console.log('═══════════════════════════════════════')
  process.exit(0)
})()
