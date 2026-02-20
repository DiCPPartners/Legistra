import { CHAT_PROMPT, FORMAT_PROMPT, ANALYSIS_PROMPT, PROMPTS } from '../config/prompts.js'

// ===== CONFIGURATION =====
const API_URL = 'https://api.openai.com/v1/chat/completions'
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

// Modelli in ordine di preferenza (GPT-4o è il più potente e veloce)
const MODELS = {
  PRIMARY: 'gpt-4o',           // Migliore per chat e ragionamento
  VISION: 'gpt-4o',            // Migliore per OCR (Vision)
  FAST: 'gpt-4o-mini',         // Veloce ed economico per task semplici
  FALLBACK: 'gpt-4-turbo',     // Fallback se GPT-4o non disponibile
  LONG_DOCS: 'gpt-4',          // GPT-4 base per documenti lunghi
}

// Modelli Claude per documenti lunghi
const CLAUDE_MODELS = {
  SONNET: 'claude-sonnet-4-20250514',     // Claude Sonnet 4 (più recente)
  SONNET_35: 'claude-3-5-sonnet-latest',  // Claude 3.5 Sonnet (fallback)
  OPUS: 'claude-3-opus-latest',           // Più potente ma costoso
}

// Controlla se Claude è disponibile
const getAnthropicApiKey = () => import.meta.env.VITE_ANTHROPIC_API_KEY ?? ''
export const isClaudeAvailable = () => !!getAnthropicApiKey()

const DEFAULT_MODEL = MODELS.PRIMARY
const MAX_CONTEXT_CHARS = 128000  // GPT-4o supporta 128k tokens

// Retry configuration
const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY = 1000  // 1 secondo
const MAX_RETRY_DELAY = 10000     // 10 secondi

// ===== UTILITY FUNCTIONS =====

/**
 * Sleep per un tempo specificato
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Calcola delay con exponential backoff
 */
const getRetryDelay = (attempt) => {
  const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt)
  const jitter = Math.random() * 1000  // Aggiungi jitter per evitare thundering herd
  return Math.min(delay + jitter, MAX_RETRY_DELAY)
}

/**
 * Determina se un errore è retriable
 */
const isRetriableError = (error, status) => {
  // Rate limit, server errors, timeout
  if (status === 429 || status >= 500) return true
  // Network errors
  if (error.name === 'TypeError' && error.message.includes('fetch')) return true
  if (error.name === 'AbortError') return false  // Non ritentare abort
  return false
}

const buildChatMessages = (question, transcription, conversationHistory = []) => {
  const messages = [
    {
      role: 'system',
      content: CHAT_PROMPT,
    },
  ]

  // Se c'è un documento disponibile, includilo come primo messaggio user
  // (solo se non è già presente nella cronologia)
  if (transcription) {
    const documentContext = `Contenuto estratto dai documenti (prime ${MAX_CONTEXT_CHARS} battute):\n\n${transcription.slice(0, MAX_CONTEXT_CHARS)}`
    
    // Controlla se il documento è già stato incluso nei messaggi precedenti
    const documentAlreadyIncluded = conversationHistory.some(
      (msg) => msg.role === 'user' && msg.content?.includes('Contenuto estratto dai documenti')
    )

    if (!documentAlreadyIncluded) {
      messages.push({
        role: 'user',
        content: documentContext,
      })
    }
  }

  // Aggiungi tutti i messaggi precedenti della conversazione
  conversationHistory.forEach((msg) => {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({
        role: msg.role,
        content: msg.content || msg.text || '',
      })
    }
  })

  // Aggiungi il nuovo messaggio user
  if (question) {
    messages.push({
      role: 'user',
      content: question,
    })
  }

  return messages
}

const buildFormatMessages = (rawText) => [
  {
    role: 'system',
    content: FORMAT_PROMPT,
  },
  {
    role: 'user',
    content: `Testo ricevuto dal workflow (mantieni intatto il contenuto, limitati a renderlo leggibile sostituendo gli escape come \\n con a capo e rimuovendo simboli superflui):\n\n${rawText}`,
  },
]

/**
 * Chiamata OpenAI con retry automatico e fallback
 */
async function callOpenAI(apiKey, messages, options = {}) {
  if (!apiKey) {
    throw new Error('Chiave API OpenAI mancante. Imposta VITE_OPENAI_API_KEY nel file .env.')
  }

  const {
    model = DEFAULT_MODEL,
    temperature = 0.2,
    maxTokens = null,
    timeout = 120000,  // 120 secondi default (margine per tab in background)
  } = options

  let lastError = null
  const modelsToTry = [model, MODELS.FALLBACK].filter((m, i, arr) => arr.indexOf(m) === i)

  for (const currentModel of modelsToTry) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      try {
        const requestBody = {
          model: currentModel,
          messages,
          temperature,
        }
        
        if (maxTokens) {
          requestBody.max_tokens = maxTokens
        }

        const response = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          const errorText = await response.text()
          lastError = new Error(`OpenAI API error (${response.status}): ${errorText}`)
          lastError.status = response.status

          if (isRetriableError(lastError, response.status)) {
            console.warn(`OpenAI retry ${attempt + 1}/${MAX_RETRIES} for model ${currentModel}:`, lastError.message)
            await sleep(getRetryDelay(attempt))
            continue
          }
          throw lastError
        }

        const data = await response.json()
        const message = data?.choices?.[0]?.message?.content

        if (!message) {
          throw new Error('OpenAI non ha restituito alcun contenuto.')
        }

        return message.trim()

      } catch (error) {
        clearTimeout(timeoutId)
        lastError = error

        if (error.name === 'AbortError') {
          lastError = new Error(`Timeout dopo ${timeout / 1000} secondi`)
        }

        if (isRetriableError(error, error.status) && attempt < MAX_RETRIES - 1) {
          console.warn(`OpenAI retry ${attempt + 1}/${MAX_RETRIES}:`, error.message)
          await sleep(getRetryDelay(attempt))
          continue
        }
      }
    }
    
    // Se fallisce con un modello, prova il prossimo
    if (modelsToTry.indexOf(currentModel) < modelsToTry.length - 1) {
      console.warn(`Fallback da ${currentModel} a ${modelsToTry[modelsToTry.indexOf(currentModel) + 1]}`)
    }
  }

  throw lastError || new Error('Errore sconosciuto durante la chiamata OpenAI')
}

export function generateChatCompletion({ apiKey, question, transcription, conversationHistory = [] }) {
  return callOpenAI(apiKey, buildChatMessages(question, transcription, conversationHistory))
}

export function formatWorkflowOutput({ apiKey, rawText }) {
  return callOpenAI(apiKey, buildFormatMessages(rawText))
}

const buildAnalysisMessages = (transcription, userPrompt = '') => {
  const messages = [
    {
      role: 'system',
      content: ANALYSIS_PROMPT,
    },
  ]

  const documentContext = `Documenti da analizzare (prime ${MAX_CONTEXT_CHARS} battute):\n\n${transcription.slice(0, MAX_CONTEXT_CHARS)}`
  messages.push({
    role: 'user',
    content: documentContext,
  })

  if (userPrompt) {
    messages.push({
      role: 'user',
      content: `Richiesta specifica: ${userPrompt}`,
    })
  }

  return messages
}

export function generateMedicalLegalAnalysis({ apiKey, transcription, userPrompt = '' }) {
  if (!transcription || !transcription.trim()) {
    throw new Error('Trascrizione non disponibile per l\'analisi.')
  }
  return callOpenAI(apiKey, buildAnalysisMessages(transcription, userPrompt))
}

const buildSpecializedAnalysisMessages = (transcription, actionId, userPrompt = '') => {
  const systemPrompt = PROMPTS[actionId] || ANALYSIS_PROMPT
  
  const messages = [
    {
      role: 'system',
      content: systemPrompt,
    },
  ]

  const documentContext = `Documenti da analizzare (prime ${MAX_CONTEXT_CHARS} battute):\n\n${transcription.slice(0, MAX_CONTEXT_CHARS)}`
  messages.push({
    role: 'user',
    content: documentContext,
  })

  if (userPrompt) {
    messages.push({
      role: 'user',
      content: `Richiesta specifica: ${userPrompt}`,
    })
  }

  return messages
}

export function generateSpecializedAnalysis({ apiKey, transcription, actionId, userPrompt = '' }) {
  if (!transcription || !transcription.trim()) {
    throw new Error('Trascrizione non disponibile per l\'analisi.')
  }
  if (!actionId || !PROMPTS[actionId]) {
    throw new Error(`Azione non valida: ${actionId}`)
  }
  return callOpenAI(apiKey, buildSpecializedAnalysisMessages(transcription, actionId, userPrompt))
}

/**
 * Sistema avanzato di emulazione documenti - Approccio basato su apprendimento stilistico
 * 
 * Il sistema funziona in questo modo:
 * 1. APPRENDIMENTO: Analizza i documenti di riferimento come campioni di stile (struttura, tono, lessico, lunghezze)
 * 2. ESTRAZIONE: Estrae dai documenti fonte i dati rilevanti per il contenuto
 * 3. GENERAZIONE: Genera il documento adattando il contenuto allo stile appreso
 * 
 * Principio fondamentale: "Il contenuto può cambiare, lo stile NO"
 * Il documento generato deve essere indistinguibile dall'autore dei documenti di riferimento.
 */

const TEMPLATE_ANALYSIS_PROMPT = `Sei un analista esperto di documenti medico-legali. Analizza il template fornito e identifica:

1. STRUTTURA SEZIONI
Per ogni sezione del documento, identifica:
- Titolo/Intestazione della sezione
- Numero approssimativo di parole
- Tipo di contenuto (dati anagrafici, anamnesi, esame obiettivo, diagnosi, conclusioni, etc.)
- Elementi ricorrenti o formule tipiche

2. STILE
- Tono generale (formale, tecnico, accademico)
- Formule di apertura e chiusura
- Modi di citare dati clinici
- Livello di dettaglio

Rispondi in formato JSON strutturato.`

/**
 * Prompt per generare il prompt personalizzato di una categoria
 * Questo viene usato per creare istruzioni specifiche basate sui template caricati
 */
const CATEGORY_PROMPT_GENERATOR = `Sei un esperto di prompt engineering specializzato in documenti medico-legali italiani.

Analizza i template di esempio forniti e genera un PROMPT SPECIFICO che catturi lo stile, la struttura e le caratteristiche uniche di questa categoria di documenti.

Il prompt che generi deve essere usato per istruire un'AI a generare nuovi documenti nello stesso stile.

⚠️ ANALISI CRITICA PRIORITARIA:

PRIMA DI TUTTO, determina:

A) SINTESI vs PROLISSITÀ
   - Questo autore è SINTETICO (rielabora, seleziona, va al punto)?
   - O è PROLISSO (trascrive integralmente, accumula, espande)?
   - Questa è l'informazione PIÙ IMPORTANTE da catturare!

B) CLINICO-DESCRITTIVO vs PERITALE-ARGOMENTATIVO
   - Lo stile è clinico (neutro, descrittivo, essenziale)?
   - O è peritale (argomentativo, difensivo, forense)?

C) GESTIONE DELLA DOCUMENTAZIONE
   - I referti vengono trascritti integralmente?
   - O vengono sintetizzati in poche righe?
   - O vengono rielaborati nel discorso?

ANALIZZA ANCHE:

1. STRUTTURA
   - Elenca le sezioni nell'ordine in cui appaiono
   - Per ogni sezione indica se è breve o estesa
   - Identifica formule di apertura/chiusura

2. TERMINOLOGIA SPECIFICA
   - Estrai espressioni ricorrenti ESATTE (cita tra virgolette)
   - Nota i riferimenti normativi citati

3. SINTASSI
   - Frasi brevi e lineari? O lunghe e complesse?
   - Quanti periodi per paragrafo in media?

4. CONCLUSIONI
   - Separate nettamente o integrate nella narrazione?
   - Dirette o argomentate?

FORMATO OUTPUT:
Rispondi SOLO con il prompt. Inizia con "Per documenti di tipo [NOME_CATEGORIA]:".

⚠️ NEL PROMPT CHE GENERI, INCLUDI SEMPRE:
- Se lo stile è SINTETICO: "NON espandere, NON trascrivere integralmente, VAI AL PUNTO"
- Se lo stile è CLINICO: "NON argomentare, NON costruire difese, DESCRIVI SOLO"
- Indicazioni chiare sulla lunghezza tipica delle frasi e dei paragrafi`

/**
 * Genera un prompt personalizzato per una categoria analizzando i suoi template
 * Questo prompt viene poi usato durante la generazione di nuovi documenti
 * 
 * @param {Object} params - Parametri
 * @param {string} params.categoryName - Nome della categoria
 * @param {Array} params.templates - Array di template con original_content
 * @param {string} params.apiKey - API key OpenAI
 * @returns {Promise<string>} Il prompt personalizzato generato
 */
export async function generateCategoryPrompt({ categoryName, templates, apiKey }) {
  if (!templates || templates.length === 0) {
    throw new Error('Almeno un template è necessario per generare il prompt')
  }
  
  if (!apiKey) {
    throw new Error('API key OpenAI mancante')
  }

  // Prepara il contenuto dei template per l'analisi
  const templatesContent = templates.map((t, i) => {
    const content = t.original_content || ''
    const wordCount = content.split(/\s+/).filter(w => w.length > 0).length
    return `
═══════════════════════════════════════════════════════════════
TEMPLATE ${i + 1} - ${t.file_name || 'Documento'} (${wordCount} parole)
═══════════════════════════════════════════════════════════════

${content.slice(0, 15000)}${content.length > 15000 ? '\n\n[...contenuto troncato...]' : ''}`
  }).join('\n\n')

  const messages = [
    {
      role: 'system',
      content: CATEGORY_PROMPT_GENERATOR
    },
    {
      role: 'user',
      content: `Categoria: "${categoryName}"

Numero di template da analizzare: ${templates.length}

${templatesContent}

───────────────────────────────────────────────────────────────
Genera ora il prompt personalizzato per questa categoria, catturando tutte le caratteristiche stilistiche e strutturali dei template sopra.`
    }
  ]

  try {
    // Usa GPT-4o per l'analisi (buon bilanciamento qualità/costo)
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODELS.PRIMARY, // gpt-4o
        messages,
        temperature: 0.3, // Bassa per output consistente
        max_tokens: 4000
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error?.message || `Errore API: ${response.status}`)
    }

    const data = await response.json()
    const generatedPrompt = data.choices[0]?.message?.content?.trim()

    if (!generatedPrompt) {
      throw new Error('Nessun prompt generato')
    }

    console.log(`✅ Prompt generato per categoria "${categoryName}" (${generatedPrompt.length} caratteri)`)
    return generatedPrompt

  } catch (error) {
    console.error('Errore nella generazione del prompt di categoria:', error)
    throw error
  }
}

const STYLE_EMULATION_PROMPT = `Sei un clone stilistico. Il tuo unico scopo è produrre un documento che sia INDISTINGUIBILE da quelli scritti dall'autore originale.

<metodo>
Ti verranno forniti:
1. PROFILO STILISTICO: caratteristiche misurate e estratte dai documenti dell'autore
2. TEMPLATE ORIGINALI: documenti completi dell'autore da usare come riferimento
3. DATI DEL CASO: i dati clinici da utilizzare per il nuovo documento

Tu devi:
- Seguire il PROFILO STILISTICO come una specifica tecnica inviolabile
- Usare i TEMPLATE come modello visivo e strutturale
- Applicare i DATI DEL CASO come contenuto, ma filtrandoli e presentandoli ESATTAMENTE come farebbe l'autore originale
</metodo>

<regola_fondamentale>
L'autore originale è il TUO CLIENTE. Se lui scrive in modo sintetico, tu scrivi sintetico. Se lui trascrive i referti per intero, tu li trascrivi per intero. Se lui usa frasi di 8 parole, tu usi frasi di 8 parole. NON MIGLIORARE nulla, NON ESPANDERE nulla, NON AGGIUNGERE nulla che l'autore non aggiungerebbe.

Il documento perfetto è quello in cui l'autore originale NON riesce a distinguerlo da uno scritto da lui stesso.
</regola_fondamentale>

<selezione_dati>
Quando applichi i dati del caso:
- INCLUDI solo i dati che l'autore originale includerebbe (guarda cosa include nei template)
- OMETTI ciò che l'autore originale ometterebbe
- PRESENTA i dati nello stesso modo: se l'autore li rielabora in paragrafo, rielabora; se li elenca, elenca; se li trascrive testualmente, trascrivi
- Se i dati del caso sono insufficienti per una sezione, scrivi quella sezione con la stessa brevità che userebbe l'autore quando ha pochi dati, NON inventare
</selezione_dati>

<output>
- Produci ESCLUSIVAMENTE il documento finale
- La prima riga deve essere l'intestazione/titolo del documento, identica nel formato a quella dei template
- VIETATO: commenti, spiegazioni, descrizioni dello stile, preamboli, meta-testo
</output>`

// ===== REVISORE AUTOMATICO =====

const DOCUMENT_REVIEWER_PROMPT = `Sei un revisore stilistico. Confronti un documento generato con il template originale e correggi SOLO le discrepanze di stile, MAI il contenuto.

<cosa_correggere>
1. LUNGHEZZA FRASI: se il template ha frasi di ~12 parole e il documento ha frasi di ~25, SPEZZA le frasi
2. PROLISSITÀ: se il template è sintetico e il documento è verboso, TAGLIA le ridondanze
3. BREVITÀ: se il template è prolisso e il documento è troppo corto, ESPANDI mantenendo lo stile
4. FORMULE: se il template usa "si rileva" e il documento usa "è possibile notare", SOSTITUISCI
5. STRUTTURA: se le proporzioni delle sezioni non corrispondono, RIEQUILIBRA
6. REFERTI: se il template li sintetizza e il documento li trascrive (o viceversa), ADATTA
</cosa_correggere>

<cosa_NON_fare>
- NON cambiare fatti, dati, diagnosi, date, percentuali
- NON aggiungere informazioni non presenti
- NON rimuovere conclusioni o valutazioni medico-legali
- NON aggiungere commenti, preamboli o descrizioni dello stile
</cosa_NON_fare>

<output>
Restituisci SOLO il documento corretto. Nessun commento.
Se il documento è già conforme, restituiscilo identico.
La prima riga deve essere l'intestazione del documento.
</output>`

/**
 * Revisiona un documento generato confrontandolo con i template originali
 * Corregge discrepanze di stile senza alterare il contenuto
 * 
 * @param {Object} params - Parametri
 * @param {string} params.generatedDocument - Il documento generato da revisionare
 * @param {Array} params.templates - I template originali per il confronto
 * @param {string} params.apiKey - API key
 * @param {Function} params.onChunk - Callback per streaming (opzionale)
 * @returns {Promise<string>} Il documento revisionato
 */
export async function reviewDocument({ generatedDocument, templates, onChunk = null }) {
  if (!generatedDocument || !templates || templates.length === 0) {
    return generatedDocument // Niente da revisionare
  }
  
  // Usa la chiave Anthropic per Claude (il revisore usa Claude)
  const apiKey = getAnthropicApiKey()
  if (!apiKey) {
    console.warn('⚠️ Chiave Anthropic mancante, skip revisione')
    return generatedDocument
  }
  
  console.log('📝 Avvio revisione documento...')

  // Prepara i template per il confronto (usa solo il primo, più rappresentativo)
  const mainTemplate = templates[0]
  const templateContent = mainTemplate.original_content || ''
  const templateWordCount = templateContent.split(/\s+/).filter(w => w).length
  const docWordCount = generatedDocument.split(/\s+/).filter(w => w).length

  const messages = [
    {
      role: 'system',
      content: DOCUMENT_REVIEWER_PROMPT
    },
    {
      role: 'user',
      content: `<template_originale>
${templateContent}
</template_originale>

<statistiche_template>
Parole template: ${templateWordCount}
</statistiche_template>

<documento_da_revisionare>
${generatedDocument}
</documento_da_revisionare>

<statistiche_documento>
Parole documento: ${docWordCount}
Differenza: ${docWordCount > templateWordCount ? '+' : ''}${docWordCount - templateWordCount} parole (${Math.round((docWordCount / templateWordCount) * 100)}% del template)
</statistiche_documento>

Confronta il documento con il template e correggi le discrepanze di STILE (non di contenuto).
Se il documento è ${docWordCount > templateWordCount * 1.3 ? 'SIGNIFICATIVAMENTE PIÙ LUNGO del template - valuta se accorciare' : docWordCount < templateWordCount * 0.7 ? 'SIGNIFICATIVAMENTE PIÙ CORTO del template - valuta se è appropriato' : 'di lunghezza simile al template'}.`
    }
  ]

  try {
    // Se abbiamo onChunk, usa streaming
    if (onChunk) {
      const streamResult = await streamWithClaude({
        messages,
        apiKey,
        onChunk,
        maxTokens: 8000
      })
      return stripLeakedInstructions(streamResult)
    }

    // Altrimenti chiamata normale con Claude
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: CLAUDE_MODELS.SONNET,
        max_tokens: 8000,
        temperature: 0.3, // Bassa per consistenza
        messages
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('Errore revisione documento:', errorData)
      return generatedDocument // In caso di errore, restituisci originale
    }

    const data = await response.json()
    const revisedDocument = data.content?.[0]?.text?.trim()

    if (!revisedDocument) {
      return generatedDocument
    }

    // Rimuovi eventuali istruzioni trapelate dal revisore
    const cleanedRevised = stripLeakedInstructions(revisedDocument)
    console.log(`📝 Documento revisionato: ${docWordCount} → ${cleanedRevised.split(/\s+/).filter(w => w).length} parole`)
    return cleanedRevised

  } catch (error) {
    console.error('Errore durante la revisione:', error)
    return generatedDocument // In caso di errore, restituisci originale
  }
}

/**
 * Helper per streaming con Claude (usato dal revisore)
 */
async function streamWithClaude({ messages, apiKey, onChunk, maxTokens = 8000 }) {
  const controller = new AbortController()
  let stallTimeout = null
  const resetStallTimeout = () => {
    if (stallTimeout) clearTimeout(stallTimeout)
    stallTimeout = setTimeout(() => controller.abort(), STREAM_STALL_TIMEOUT)
  }

  let reader = null
  try {
    resetStallTimeout()
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: CLAUDE_MODELS.SONNET,
        max_tokens: maxTokens,
        temperature: 0.3,
        stream: true,
        messages
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Errore API Claude: ${response.status}`)
    }

    reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullText = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      resetStallTimeout()

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'content_block_delta' && data.delta?.text) {
              fullText += data.delta.text
              onChunk(data.delta.text, fullText)
            }
          } catch (e) {
            // Ignora errori di parsing
          }
        }
      }
    }

    return fullText
  } finally {
    if (stallTimeout) clearTimeout(stallTimeout)
    if (reader) { try { reader.releaseLock() } catch (e) { /* ignore */ } }
  }
}

/**
 * Rimuove istruzioni/meta-commenti che l'AI potrebbe aver inserito all'inizio del documento.
 * Es: "Stile conciso e chiaro.", "Ecco il documento:", "Approccio: sintetico..."
 */
const stripLeakedInstructions = (text) => {
  if (!text || typeof text !== 'string') return text

  let cleaned = text.trim()
  
  // Pattern di istruzioni che l'AI tende a mettere all'inizio
  const instructionPatterns = [
    // "Stile: conciso e chiaro" o "Stile conciso e chiaro."
    /^stile[\s:]+[^\n]{5,80}\.?\s*\n/i,
    // "Approccio: sintetico e clinico-descrittivo"
    /^approccio[\s:]+[^\n]{5,80}\.?\s*\n/i,
    // "Tono: formale e professionale"
    /^tono[\s:]+[^\n]{5,80}\.?\s*\n/i,
    // "Registro: clinico-descrittivo"
    /^registro[\s:]+[^\n]{5,80}\.?\s*\n/i,
    // "Formato: perizia medico-legale"
    /^formato[\s:]+[^\n]{5,80}\.?\s*\n/i,
    // "Ecco il documento generato:" / "Ecco il documento revisionato:"
    /^ecco\s+(il|la)\s+[^\n]{5,80}:?\s*\n/i,
    // "Procedo a generare..." / "Procedo con..."
    /^procedo\s+(a|con)\s+[^\n]{5,80}\.?\s*\n/i,
    // "Di seguito il documento..."
    /^di\s+seguito\s+[^\n]{5,80}:?\s*\n/i,
    // Singola riga breve (<80 chars) che sembra un meta-commento prima del vero documento
    // Es: "sintetico, clinico-descrittivo, essenziale."
    /^[a-zà-ú][a-zà-ú\s,\-\.]{5,79}\.?\s*\n\n/i,
  ]
  
  // Applica i pattern finché ce ne sono da rimuovere (max 3 iterazioni per sicurezza)
  for (let i = 0; i < 3; i++) {
    let changed = false
    for (const pattern of instructionPatterns) {
      const before = cleaned
      cleaned = cleaned.replace(pattern, '')
      if (cleaned !== before) {
        cleaned = cleaned.trim()
        changed = true
        break // Ricomincia dall'inizio dopo ogni rimozione
      }
    }
    if (!changed) break
  }
  
  return cleaned
}

/**
 * Analisi stilistica programmatica di un template.
 * Estrae metriche misurabili che l'AI può seguire come specifiche.
 */
const analyzeTemplateStyle = (content) => {
  if (!content) return null
  
  const lines = content.split('\n')
  const nonEmptyLines = lines.filter(l => l.trim().length > 0)
  
  // Estrai frasi (split su . ! ? seguiti da spazio o fine riga)
  const sentences = content.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 3)
  const sentenceLengths = sentences.map(s => s.split(/\s+/).filter(w => w).length)
  const avgSentenceLen = sentenceLengths.length > 0 ? Math.round(sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length) : 15
  const shortSentences = sentenceLengths.filter(l => l <= 10).length
  const longSentences = sentenceLengths.filter(l => l > 25).length
  
  // Parole totali
  const words = content.split(/\s+/).filter(w => w.length > 0)
  const wordCount = words.length
  
  // Paragrafi (blocchi separati da righe vuote)
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0)
  const avgParaLen = paragraphs.length > 0 ? Math.round(wordCount / paragraphs.length) : wordCount
  
  // Sezioni (intestazioni)
  const sections = []
  let currentSection = { title: '(Inizio)', words: 0 }
  lines.forEach(line => {
    const trimmed = line.trim()
    const isHeading = /^[A-Z\s]{5,}$/.test(trimmed) ||
                      /^\d+[\.\)]\s+[A-Z]/.test(trimmed) ||
                      /^[A-Z][A-Za-zÀ-ú\s]+:?\s*$/.test(trimmed) && trimmed.length < 60 ||
                      /^#{1,3}\s/.test(trimmed)
    if (isHeading && trimmed.length > 3 && trimmed.length < 80) {
      if (currentSection.words > 0) sections.push({ ...currentSection })
      currentSection = { title: trimmed, words: 0 }
    } else {
      currentSection.words += trimmed.split(/\s+/).filter(w => w).length
    }
  })
  if (currentSection.words > 0) sections.push(currentSection)
  
  // Estrai formule ricorrenti (frasi iniziali delle frasi, 3-6 parole)
  const openingFormulas = []
  sentences.forEach(s => {
    const trimmed = s.trim()
    if (trimmed.length > 10) {
      const firstWords = trimmed.split(/\s+/).slice(0, 5).join(' ')
      openingFormulas.push(firstWords)
    }
  })
  
  // Frequenza espressioni tipiche medico-legali
  const typicalPhrases = []
  const phrasePatterns = [
    /si rileva/gi, /si evidenzia/gi, /si osserva/gi, /si segnala/gi,
    /in considerazione/gi, /alla luce/gi, /per quanto riguarda/gi,
    /a parere dello scrivente/gi, /in relazione a/gi, /con riferimento/gi,
    /sulla base/gi, /dal punto di vista/gi, /si ritiene/gi,
    /è emerso/gi, /si è proceduto/gi, /tenuto conto/gi,
    /ne consegue/gi, /pertanto/gi, /in conclusione/gi,
    /il sottoscritto/gi, /lo scrivente/gi,
  ]
  phrasePatterns.forEach(pattern => {
    const matches = content.match(pattern)
    if (matches && matches.length > 0) {
      typicalPhrases.push(`"${matches[0]}" (×${matches.length})`)
    }
  })
  
  // Stile referti: sono trascritti integralmente o sintetizzati?
  const hasLongQuotes = (content.match(/[""][^""]{100,}[""]|«[^»]{100,}»/g) || []).length
  const hasDateLists = (content.match(/\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}/g) || []).length
  
  return {
    wordCount,
    avgSentenceLen,
    shortSentenceRatio: sentenceLengths.length > 0 ? Math.round((shortSentences / sentenceLengths.length) * 100) : 50,
    longSentenceRatio: sentenceLengths.length > 0 ? Math.round((longSentences / sentenceLengths.length) * 100) : 10,
    avgParaLen,
    paragraphCount: paragraphs.length,
    sections,
    typicalPhrases,
    openingFormulas: openingFormulas.slice(0, 15),
    hasLongQuotes: hasLongQuotes > 2,
    dateReferences: hasDateLists,
    isSynthetic: avgSentenceLen < 15 && avgParaLen < 80,
    isProlific: avgSentenceLen > 20 && avgParaLen > 120,
  }
}

const buildStyleEmulationMessages = ({ templates, caseData, documentType, additionalInstructions = '', customPrompt = '' }) => {
  let systemPromptContent = STYLE_EMULATION_PROMPT
  
  if (customPrompt && customPrompt.trim()) {
    systemPromptContent += `

<istruzioni_categoria_specifiche>
${customPrompt}
</istruzioni_categoria_specifiche>

IMPORTANTE: Le istruzioni specifiche della categoria sopra hanno PRIORITÀ ASSOLUTA.`
  }
  
  const messages = [
    { role: 'system', content: systemPromptContent },
  ]

  let avgWordCount = 0
  
  if (templates && templates.length > 0) {
    // === ANALISI STILISTICA PROGRAMMATICA ===
    const analyses = templates.map(t => analyzeTemplateStyle(t.original_content || ''))
    const validAnalyses = analyses.filter(a => a && a.wordCount > 50)
    
    if (validAnalyses.length > 0) {
      avgWordCount = Math.round(validAnalyses.reduce((sum, a) => sum + a.wordCount, 0) / validAnalyses.length)
      const avgSentLen = Math.round(validAnalyses.reduce((sum, a) => sum + a.avgSentenceLen, 0) / validAnalyses.length)
      const avgParaLen = Math.round(validAnalyses.reduce((sum, a) => sum + a.avgParaLen, 0) / validAnalyses.length)
      const isSynthetic = validAnalyses.every(a => a.isSynthetic)
      const isProlific = validAnalyses.every(a => a.isProlific)
      const hasLongQuotes = validAnalyses.some(a => a.hasLongQuotes)
      
      // Raccogli tutte le frasi tipiche
      const allPhrases = [...new Set(validAnalyses.flatMap(a => a.typicalPhrases))]
      
      // Struttura sezioni dal template principale
      const mainSections = validAnalyses[0].sections
      
      // === COSTRUISCI PROFILO STILISTICO ===
      let styleProfile = `<profilo_stilistico_misurato>
METRICHE ESTRATTE DAI DOCUMENTI DELL'AUTORE (da rispettare ESATTAMENTE):

DIMENSIONI:
- Lunghezza target: ${avgWordCount} parole (tolleranza: ${Math.round(avgWordCount * 0.85)}-${Math.round(avgWordCount * 1.15)})
- Paragrafi: ~${validAnalyses[0].paragraphCount} paragrafi
- Media parole per paragrafo: ~${avgParaLen}

SINTASSI:
- Lunghezza media frase: ${avgSentLen} parole per frase
- ${isSynthetic ? 'STILE SINTETICO: frasi brevi e dirette, vai al punto, NON espandere' : isProlific ? 'STILE PROLISSO: frasi lunghe e articolate, sviluppa ogni concetto, approfondisci' : `STILE MISTO: alterna frasi brevi e lunghe, media ${avgSentLen} parole`}
- ${hasLongQuotes ? 'L\'autore TRASCRIVE integralmente referti e documentazione → FAI LO STESSO' : 'L\'autore SINTETIZZA e rielabora i referti → NON trascrivere integralmente'}

STRUTTURA SEZIONI (rispetta quest'ordine ESATTO):
${mainSections.map((s, i) => `  ${i + 1}. "${s.title}" → ~${s.words} parole`).join('\n')}
`

      if (allPhrases.length > 0) {
        styleProfile += `
ESPRESSIONI RICORRENTI DELL'AUTORE (usale nel documento):
${allPhrases.slice(0, 20).map(p => `  - ${p}`).join('\n')}
`
      }

      // Aggiungi formule di apertura
      const mainOpenings = validAnalyses[0].openingFormulas
      if (mainOpenings.length > 3) {
        styleProfile += `
FORMULE DI APERTURA FRASE TIPICHE (l'autore inizia spesso così):
${mainOpenings.slice(0, 10).map(f => `  - "${f}..."`).join('\n')}
`
      }

      styleProfile += `</profilo_stilistico_misurato>`
      
      // Messaggio 1: Profilo stilistico + template
      const examplesText = templates
        .map((t, i) => {
          const content = t.original_content || ''
          return `--- TEMPLATE ${i + 1} (${content.split(/\s+/).filter(w => w).length} parole) ---\n\n${content.slice(0, 25000)}`
        })
        .join('\n\n═══════════════════════════════════════\n\n')
      
      messages.push({
        role: 'user',
        content: `${styleProfile}

<template_di_riferimento>
Questi sono i documenti originali dell'autore. Studia ogni dettaglio: intestazioni, formattazione, come apre e chiude ogni sezione, come gestisce i dati clinici.

${examplesText}
</template_di_riferimento>

Hai memorizzato il profilo stilistico e i template. Attendi i dati del caso.`,
      })
      
      // Conferma dell'AI (aiuta il modello a "entrare nel personaggio")
      messages.push({
        role: 'assistant',
        content: `Ho analizzato il profilo stilistico e i ${templates.length} template. Sono pronto a generare un documento con le stesse caratteristiche: ${isSynthetic ? 'stile sintetico e diretto' : isProlific ? 'stile prolisso e articolato' : 'stile bilanciato'}, ${avgSentLen} parole per frase in media, struttura a ${mainSections.length} sezioni. Attendo i dati del caso.`,
      })
    } else {
      avgWordCount = 1500
    }
  }

  // Messaggio con i dati del caso
  const minWords = Math.round(avgWordCount * 0.85) || 1200
  const maxWords = Math.round(avgWordCount * 1.15) || 1800
  
  messages.push({
    role: 'user',
    content: `<compito>
Genera: ${documentType}
${additionalInstructions ? `Istruzioni aggiuntive: ${additionalInstructions}` : ''}
</compito>

<dati_del_caso>
${caseData.slice(0, 50000)}
${caseData.length > 50000 ? '\n[...troncato per limiti di contesto...]' : ''}
</dati_del_caso>

<istruzioni_finali>
1. Genera il documento usando ESATTAMENTE lo stile del profilo stilistico
2. Usa i dati del caso come CONTENUTO ma presentali come farebbe l'autore originale
3. Rispetta la struttura delle sezioni nell'ordine indicato nel profilo
4. Lunghezza: ${minWords}-${maxWords} parole
5. Se i dati del caso non coprono una sezione del template, scrivi quella sezione in modo breve e coerente con lo stile dell'autore
6. Inizia DIRETTAMENTE con l'intestazione del documento
</istruzioni_finali>`,
  })

  return { messages, avgWordCount }
}

/**
 * Analizza la formattazione di un template PDF trascritto per dedurne gli stili.
 * Usa GPT-4o-mini (economico) per analizzare la struttura visiva del testo.
 */
export async function analyzeDocumentFormatting({ text, apiKey }) {
  if (!text || text.trim().length < 50) return null

  const prompt = `Analizza questo documento medico-legale e restituisci un JSON con gli stili di formattazione.

<documento>
${text.slice(0, 8000)}
</documento>

Rispondi SOLO con JSON valido (nessun testo extra, nessun markdown):
{
  "fontFamily": "Times New Roman",
  "fontSizeBody": 12,
  "fontSizeHeading1": 14,
  "fontSizeHeading2": 13,
  "alignment": "justify",
  "lineSpacing": 1.15,
  "paragraphSpacingAfter": 0,
  "paragraphSpacingBefore": 0,
  "marginTop": 25,
  "marginBottom": 25,
  "marginLeft": 30,
  "marginRight": 25,
  "headingBold": true,
  "headingAllCaps": true,
  "bodyIndentFirstLine": false,
  "headerLines": ["DOTT. NOME COGNOME", "Specialista in ...", "Via ..., Città", "Tel. ... - e-mail: ..."],
  "signatureLines": ["Città, data", "Dott. Nome Cognome"],
  "disclaimerText": "testo avviso legale se presente",
  "sectionTitles": ["PREMESSA", "ANAMNESI", "ESAME OBIETTIVO", "DIAGNOSI", "CONCLUSIONI"]
}

Regole per dedurre i valori:
- fontFamily: "Times New Roman" per documenti formali/legali, "Arial"/"Calibri" se moderno
- alignment: "justify" se i paragrafi sono giustificati (tipico dei documenti legali), "left" altrimenti
- paragraphSpacingAfter: 0 se i paragrafi sono attaccati (separati solo da interlinea), 6 se c'è un piccolo spazio, 12 se c'è spazio evidente
- lineSpacing: 1.0 (singola), 1.15 (leggermente aperta), 1.5 (aperta). Analizza la densità del testo per capirlo
- headingAllCaps: true se i titoli delle sezioni sono in MAIUSCOLO
- bodyIndentFirstLine: true se la prima riga di ogni paragrafo è rientrata
- headerLines: righe dell'intestazione (nome, qualifica, indirizzo, telefono, email) - array vuoto se assente
- signatureLines: righe della firma finale - array vuoto se assente
- disclaimerText: avviso legale in fondo al documento - stringa vuota se assente
- sectionTitles: titoli sezioni rilevati nel documento`

  try {
    const result = await callOpenAI(apiKey, [
      { role: 'system', content: 'Sei un analizzatore di formattazione documenti. Rispondi solo con JSON valido.' },
      { role: 'user', content: prompt }
    ], { model: MODELS.FAST, temperature: 0, maxTokens: 2000 })

    const cleaned = result.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '')
    const parsed = JSON.parse(cleaned)
    
    parsed.extractedFrom = 'ai-analysis'
    parsed.extractedAt = new Date().toISOString()
    
    console.log('📐 Formattazione analizzata da AI:', parsed)
    return parsed
  } catch (error) {
    console.warn('Errore analisi formattazione:', error)
    return null
  }
}

export function generateDocumentWithStyle({ apiKey, templates, caseData, documentType, additionalInstructions = '', customPrompt = '' }) {
  if (!caseData || !caseData.trim()) {
    throw new Error('Dati del caso non disponibili per la generazione.')
  }
  if (!documentType) {
    throw new Error('Tipo di documento non specificato.')
  }
  
  const { messages, avgWordCount } = buildStyleEmulationMessages({ templates, caseData, documentType, additionalInstructions, customPrompt })
  
  // Calcola max_tokens basato sulla lunghezza attesa - AUMENTATO significativamente
  // Per 1800 parole servono almeno 4000 token, ma usiamo 16000 per sicurezza
  const minTokens = 16000
  const estimatedTokens = Math.max(minTokens, Math.round(avgWordCount * 3))
  const maxTokens = Math.min(estimatedTokens, 32000) // Cap a 32k
  
  return callOpenAI(apiKey, messages, { maxTokens, temperature: 0.3 })
}

// ===== STREAMING FUNCTIONS =====

// Timeout per rilevare stream bloccato (8 secondi senza dati = probabile background)
// Timeout più lungo per evitare interruzioni quando la tab è in background
// I browser throttlano i timer delle tab nascoste, quindi serve un margine ampio
const STREAM_STALL_TIMEOUT = 30000

/**
 * Chiamata Claude/Anthropic con streaming
 * Claude è ottimo per documenti lunghi - segue meglio le istruzioni sulla lunghezza
 */
async function callClaudeStreaming(messages, onChunk = () => {}, options = {}) {
  const apiKey = getAnthropicApiKey()
  if (!apiKey) {
    throw new Error('Chiave API Anthropic mancante. Imposta VITE_ANTHROPIC_API_KEY nel file .env.')
  }

  const {
    model = CLAUDE_MODELS.SONNET,
    temperature = 0.3,
    maxTokens = 8000,
  } = options

  const systemMessage = messages.find(m => m.role === 'system')?.content || ''
  const claudeMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }))

  const controller = new AbortController()
  let stallTimeout = null
  const resetStallTimeout = () => {
    if (stallTimeout) clearTimeout(stallTimeout)
    stallTimeout = setTimeout(() => controller.abort(), STREAM_STALL_TIMEOUT)
  }

  let reader = null
  try {
    resetStallTimeout()
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemMessage,
        messages: claudeMessages,
        stream: true
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Claude API error (${response.status}): ${errorText}`)
    }

    reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullText = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      resetStallTimeout()

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n').filter(line => line.trim() !== '')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'content_block_delta') {
              const content = parsed.delta?.text
              if (content) {
                fullText += content
                onChunk(content, fullText)
              }
            }
          } catch (e) {
            // Ignora errori di parsing
          }
        }
      }
    }

    return fullText.trim()
  } catch (error) {
    console.error('Errore chiamata Claude:', error)
    throw error
  } finally {
    if (stallTimeout) clearTimeout(stallTimeout)
    if (reader) { try { reader.releaseLock() } catch (e) { /* ignore */ } }
  }
}

/**
 * Chiamata OpenAI con streaming e retry automatico
 */
async function callOpenAIStreaming(apiKey, messages, onChunk = () => {}, options = {}) {
  if (!apiKey) {
    throw new Error('Chiave API OpenAI mancante. Imposta VITE_OPENAI_API_KEY nel file .env.')
  }

  const {
    model = DEFAULT_MODEL,
    temperature = 0.2,
    maxTokens = null,
  } = options

  // Non interrompere mai lo streaming per tab nascosta: il fetch continua comunque in background

  let lastError = null
  const modelsToTry = [model, MODELS.FALLBACK].filter((m, i, arr) => arr.indexOf(m) === i)

  for (const currentModel of modelsToTry) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const controller = new AbortController()
      let stallTimeout = null
      let streamStalled = false

      const resetStallTimeout = () => {
        if (stallTimeout) clearTimeout(stallTimeout)
        stallTimeout = setTimeout(() => {
          streamStalled = true
          controller.abort()
        }, STREAM_STALL_TIMEOUT)
      }

      try {
        resetStallTimeout()

        const response = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ 
            model: currentModel, 
            messages, 
            temperature,
            stream: true,
            ...(maxTokens && { max_tokens: maxTokens })
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const errorText = await response.text()
          lastError = new Error(`OpenAI API error (${response.status}): ${errorText}`)
          lastError.status = response.status

          if (stallTimeout) clearTimeout(stallTimeout)

          if (isRetriableError(lastError, response.status)) {
            console.warn(`OpenAI streaming retry ${attempt + 1}/${MAX_RETRIES}:`, lastError.message)
            await sleep(getRetryDelay(attempt))
            continue
          }
          throw lastError
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let fullText = ''

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            resetStallTimeout()

            const chunk = decoder.decode(value, { stream: true })
            const lines = chunk.split('\n').filter(line => line.trim() !== '')

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6)
                if (data === '[DONE]') continue

                try {
                  const parsed = JSON.parse(data)
                  const content = parsed.choices?.[0]?.delta?.content
                  if (content) {
                    fullText += content
                    onChunk(content, fullText)
                  }
                } catch (e) {
                  // Ignora errori di parsing per chunk incompleti
                }
              }
            }
          }
        } finally {
          try { reader.releaseLock() } catch (e) { /* ignore */ }
        }

        if (stallTimeout) clearTimeout(stallTimeout)
        return fullText.trim()

      } catch (error) {
        if (stallTimeout) clearTimeout(stallTimeout)
        lastError = error
        
        // Se lo stream si è bloccato (probabilmente a causa del background), riprova con non-streaming
        if (streamStalled || error.name === 'AbortError') {
          console.log('Stream bloccato, passaggio a modalità non-streaming...')
          try {
            const result = await callOpenAI(apiKey, messages, { model: currentModel, temperature })
            onChunk(result, result)
            return result
          } catch (fallbackError) {
            lastError = fallbackError
          }
        }

        if (isRetriableError(error, error.status) && attempt < MAX_RETRIES - 1) {
          console.warn(`OpenAI streaming retry ${attempt + 1}/${MAX_RETRIES}:`, error.message)
          await sleep(getRetryDelay(attempt))
          continue
        }
      }
    }

    // Se fallisce con un modello, prova il prossimo
    if (modelsToTry.indexOf(currentModel) < modelsToTry.length - 1) {
      console.warn(`Streaming fallback da ${currentModel} a ${modelsToTry[modelsToTry.indexOf(currentModel) + 1]}`)
    }
  }

  throw lastError || new Error('Errore sconosciuto durante lo streaming OpenAI')
}

export function generateChatCompletionStreaming({ apiKey, question, transcription, conversationHistory = [], onChunk = () => {} }) {
  return callOpenAIStreaming(apiKey, buildChatMessages(question, transcription, conversationHistory), onChunk)
}

export function generateSpecializedAnalysisStreaming({ apiKey, transcription, actionId, userPrompt = '', onChunk = () => {} }) {
  if (!transcription || !transcription.trim()) {
    throw new Error('Trascrizione non disponibile per l\'analisi.')
  }
  if (!actionId || !PROMPTS[actionId]) {
    throw new Error(`Azione non valida: ${actionId}`)
  }
  return callOpenAIStreaming(apiKey, buildSpecializedAnalysisMessages(transcription, actionId, userPrompt), onChunk)
}

export async function generateDocumentWithStyleStreaming({ apiKey, templates, caseData, documentType, additionalInstructions = '', customPrompt = '', onChunk = () => {} }) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/dc883744-306a-4dd9-9042-7007785805be',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'openai.js:generateDocWithStyle',message:'generateDocumentWithStyleStreaming CALLED',data:{numTemplates:templates?.length,documentType,caseDataLength:caseData?.length,hasCustomPrompt:!!customPrompt},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F'})}).catch(()=>{});
  // #endregion
  if (!caseData || !caseData.trim()) {
    throw new Error('Dati del caso non disponibili per la generazione.')
  }
  if (!documentType) {
    throw new Error('Tipo di documento non specificato.')
  }
  
  // DEBUG: Analisi dettagliata dei template PRIMA di costruire i messaggi
  console.log('=== DEBUG GENERAZIONE DOCUMENTO ===')
  console.log('Templates ricevuti:', templates?.length || 0)
  
  let totalWords = 0
  const templateStats = templates?.map((t, i) => {
    const content = t.original_content || ''
    const words = content.split(/\s+/).filter(w => w.length > 0).length
    totalWords += words
    console.log(`Template ${i + 1}: ${words} parole, ${content.length} caratteri`)
    if (words < 100) {
      console.warn(`⚠️ ATTENZIONE: Template ${i + 1} ha solo ${words} parole - contenuto probabilmente mancante!`)
    }
    return { index: i + 1, words, chars: content.length }
  }) || []
  
  const calculatedAvgWords = templates?.length > 0 ? Math.round(totalWords / templates.length) : 0
  console.log('Media parole calcolata direttamente:', calculatedAvgWords)
  
  // ERRORE se i template non hanno contenuto sufficiente
  if (calculatedAvgWords < 500 && templates?.length > 0) {
    const errorMsg = `⚠️ PROBLEMA RILEVATO: I template hanno in media solo ${calculatedAvgWords} parole!

Statistiche template:
${templateStats.map(s => `- Template ${s.index}: ${s.words} parole`).join('\n')}

Questo indica che il contenuto dei template NON è stato salvato correttamente nel database.
Vai nella sezione "Document Templates" per verificare che ogni template mostri il numero corretto di parole.

Se i template mostrano poche parole, devi ricaricarli.`
    
    console.error(errorMsg)
    // Mostra alert all'utente
    if (typeof window !== 'undefined') {
      alert(errorMsg)
    }
  }
  
  const { messages, avgWordCount } = buildStyleEmulationMessages({ templates, caseData, documentType, additionalInstructions, customPrompt })
  
  console.log('avgWordCount da buildStyleEmulationMessages:', avgWordCount)
  if (customPrompt) {
    console.log('📝 Usando prompt personalizzato della categoria (' + customPrompt.length + ' caratteri)')
  }
  
  // Calcola max_tokens basato sulla lunghezza attesa - AUMENTATO significativamente
  // Per 1800 parole servono almeno 4000 token, ma usiamo 16000 per sicurezza
  // Il modello tende a fermarsi prima se il limite è troppo basso
  const minTokens = 16000 // Minimo per incoraggiare output lunghi
  const estimatedTokens = Math.max(minTokens, Math.round(avgWordCount * 3)) // 3 token per parola italiana
  const maxTokens = Math.min(estimatedTokens, 32000) // Cap a 32k
  
  console.log('max_tokens impostato:', maxTokens, '(minTokens:', minTokens, ', avgWordCount:', avgWordCount, ')')
  console.log('===================================')
  
  // Usa Claude se disponibile (migliore per documenti lunghi), altrimenti GPT-4
  const claudeKey = getAnthropicApiKey()
  const useClaude = !!claudeKey
  console.log('🔑 Claude API key presente:', claudeKey ? `${claudeKey.slice(0, 10)}...` : 'NO')
  console.log('🤖 Modello scelto:', useClaude ? 'Claude 3.5 Sonnet (Anthropic)' : 'GPT-4 (OpenAI)')
  
  // Prima generazione
  let result
  if (useClaude) {
    result = await callClaudeStreaming(messages, onChunk, { 
      model: CLAUDE_MODELS.SONNET,
      temperature: 0.3,
      maxTokens: Math.max(maxTokens, 8000)
    })
  } else {
    result = await callOpenAIStreaming(apiKey, messages, onChunk, { 
      model: MODELS.LONG_DOCS, 
      temperature: 0.4,
      maxTokens 
    })
  }
  
  // Rimuovi eventuali istruzioni/meta-commenti trapelati all'inizio del documento
  result = stripLeakedInstructions(result)
  
  // Conta parole del risultato
  const resultWordCount = result.split(/\s+/).filter(w => w.length > 0).length
  const targetWords = avgWordCount || 1500
  
  // Se il documento è troppo corto (meno del 70% del target), chiedi di continuare
  if (resultWordCount < targetWords * 0.7) {
    console.log(`Documento troppo corto: ${resultWordCount} parole vs ${targetWords} target. Richiedo continuazione...`)
    
    const continuationMessages = [
      ...messages,
      { role: 'assistant', content: result },
      { 
        role: 'user', 
        content: `⚠️ ATTENZIONE: Il documento che hai generato ha solo ${resultWordCount} parole, ma doveva averne almeno ${targetWords} come i template di riferimento.

CONTINUA A SCRIVERE il documento. Non ripetere quello che hai già scritto, ma ESPANDI e AGGIUNGI:
- Approfondisci ogni sezione con più dettagli clinici
- Aggiungi considerazioni medico-legali più estese
- Includi riferimenti normativi e giurisprudenziali
- Espandi le valutazioni prognostiche
- Articola meglio le conclusioni

Scrivi ALMENO altre ${targetWords - resultWordCount} parole per completare il documento.`
      }
    ]
    
    let continuation
    if (useClaude) {
      continuation = await callClaudeStreaming(continuationMessages, (chunk, fullText) => {
        onChunk(chunk, result + '\n\n' + fullText)
      }, { 
        model: CLAUDE_MODELS.SONNET,
        temperature: 0.3,
        maxTokens: Math.max(8000, (targetWords - resultWordCount) * 3)
      })
    } else {
      continuation = await callOpenAIStreaming(apiKey, continuationMessages, (chunk, fullText) => {
        onChunk(chunk, result + '\n\n' + fullText)
      }, { 
        model: MODELS.LONG_DOCS, 
        temperature: 0.4, 
        maxTokens: Math.max(8000, (targetWords - resultWordCount) * 3)
      })
    }
    
    result = result + '\n\n' + continuation
    console.log(`Dopo continuazione: ${result.split(/\s+/).filter(w => w.length > 0).length} parole`)
  }
  
  // Pulizia finale: rimuovi eventuali istruzioni trapelate
  return stripLeakedInstructions(result)
}

// ===== GEMINI/OCR FUNCTIONS =====

const getGeminiApiKey = () => import.meta.env.VITE_GEMINI_API_KEY ?? ''

export function isGeminiTranscriptionAvailable() {
  return !!getGeminiApiKey()
}

export function isGeminiVisionAvailable() {
  return !!getGeminiApiKey()
}

export function getRecommendedTranscriptionModel(charCount) {
  // Per ora sempre OpenAI, ma potrebbe essere esteso per usare Gemini per documenti molto lunghi
  return 'gpt-4-turbo'
}

export async function transcribeWithFallback({ text, fileName = '', apiKey, onChunk = () => {} }) {
  // Usa gpt-4o-mini per formattazione - più veloce ed economico, sufficiente per questo compito
  const messages = [
    {
      role: 'system',
      content: FORMAT_PROMPT,
    },
    {
      role: 'user',
      content: `${fileName ? `Documento: ${fileName}\n\n` : ''}Testo estratto:\n\n${text}`,
    },
  ]
  
  // Usa modello veloce per formattazione - con maxTokens alto per non troncare documenti lunghi
  const options = { model: MODELS.FAST, maxTokens: 16000 }
  
  if (onChunk) {
    return callOpenAIStreaming(apiKey, messages, onChunk, options)
  }
  return callOpenAI(apiKey, messages, options)
}

// ===== OCR FUNCTIONS =====

// Prompt ottimizzato per OCR di documenti medico-legali
const OCR_SYSTEM_PROMPT = `Sei un sistema OCR di precisione professionale specializzato in documenti medico-legali.

ISTRUZIONI:
1. Estrai TUTTO il testo visibile dall'immagine con la massima accuratezza
2. Mantieni la formattazione originale: paragrafi, elenchi, indentazione
3. Riproduci le tabelle in formato testuale allineato
4. NON aggiungere commenti, interpretazioni o spiegazioni
5. Se un testo è illeggibile, indica [illeggibile]

ATTENZIONE PARTICOLARE A:
- Nomi propri, cognomi, date di nascita
- Codici fiscali, numeri di protocollo, codici ICD
- Diagnosi, prognosi, terapie prescritte
- Valori numerici con unità di misura (mg, ml, mmHg, etc.)
- Firme e timbri → indica [Firma] o [Timbro]
- Intestazioni di strutture sanitarie

OUTPUT: Solo il testo estratto, nient'altro.`

/**
 * OCR con priorità Gemini (gratuito) e fallback a GPT-4o Vision
 * Ottimizzato per costi: Gemini è gratuito e quasi alla pari con GPT-4o per OCR
 */
export async function performOCRWithGemini({ images, mimeType = 'image/jpeg', fileName = '', onChunk = () => {} }) {
  const openaiKey = import.meta.env.VITE_OPENAI_API_KEY ?? ''
  const geminiKey = getGeminiApiKey()

  if (!images || images.length === 0) {
    throw new Error('Nessuna immagine fornita per OCR.')
  }

  // OTTIMIZZAZIONE COSTI: Gemini è GRATUITO e ottimo per OCR
  // Prova prima Gemini, poi GPT-4o come fallback per casi difficili
  
  if (geminiKey) {
    try {
      const result = await performOCRWithGeminiFallback({ images, mimeType, fileName, onChunk })
      return result
    } catch (error) {
      console.warn('Gemini OCR fallito, tentativo con GPT-4o Vision:', error.message)
      // Fallback a GPT-4o Vision se disponibile
      if (openaiKey) {
        return await performOCRWithGPT4Vision({
          images,
          mimeType,
          fileName,
          apiKey: openaiKey,
          onChunk,
        })
      }
      throw error
    }
  }

  // Se non c'è Gemini key, usa GPT-4o Vision
  if (openaiKey) {
    return await performOCRWithGPT4Vision({
      images,
      mimeType,
      fileName,
      apiKey: openaiKey,
      onChunk,
    })
  }

  throw new Error('Nessuna API key configurata per OCR. Imposta VITE_GEMINI_API_KEY (gratuito) o VITE_OPENAI_API_KEY.')
}

/**
 * OCR con GPT-4o Vision - il miglior OCR disponibile
 */
async function performOCRWithGPT4Vision({ images, mimeType, fileName, apiKey, onChunk }) {
  let fullText = ''
  
  // GPT-4o può gestire più immagini per richiesta - batch più grandi per velocità
  const BATCH_SIZE = 8  // 8 pagine per richiesta per massima velocità
  
  for (let i = 0; i < images.length; i += BATCH_SIZE) {
    const batch = images.slice(i, i + BATCH_SIZE)
    const batchStart = i + 1
    const batchEnd = Math.min(i + BATCH_SIZE, images.length)
    
    if (onChunk) {
      onChunk('', `Riconoscimento ottico dei caratteri in corso\nAnalisi pagine ${batchStart}-${batchEnd} di ${images.length}...\n\nL'intelligenza artificiale sta esaminando ogni dettaglio per garantire la massima accuratezza.`)
    }
    
    // Costruisci il contenuto per GPT-4o Vision
    const content = []
    
    // Aggiungi le immagini
    batch.forEach((imageBase64) => {
      // Assicurati che abbia il prefisso corretto
      const imageUrl = imageBase64.startsWith('data:') 
        ? imageBase64 
        : `data:${mimeType};base64,${imageBase64}`
      
      content.push({
        type: 'image_url',
        image_url: {
          url: imageUrl,
          detail: 'high'  // Alta qualità per OCR
        }
      })
    })
    
    // Aggiungi il prompt
    const pageInfo = batch.length > 1 
      ? `Pagine ${batchStart}-${batchEnd} di ${images.length}.` 
      : `Pagina ${batchStart} di ${images.length}.`
    
    content.push({
      type: 'text',
      text: `${pageInfo}${fileName ? ` File: ${fileName}` : ''}\n\nEstrai tutto il testo visibile:`
    })
    
    const messages = [
      { role: 'system', content: OCR_SYSTEM_PROMPT },
      { role: 'user', content }
    ]

    // Usa la funzione con retry
    let lastError = null
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: MODELS.VISION,
            messages,
            max_tokens: 16000,  // Aumentato da 4096 per non troncare documenti lunghi
            temperature: 0.1,
          }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          lastError = new Error(`GPT-4o Vision error (${response.status}): ${errorText}`)
          
          if (isRetriableError(lastError, response.status)) {
            console.warn(`OCR retry ${attempt + 1}/${MAX_RETRIES}:`, lastError.message)
            await sleep(getRetryDelay(attempt))
            continue
          }
          throw lastError
        }

        const data = await response.json()
        const extractedText = data?.choices?.[0]?.message?.content || ''

        if (extractedText) {
          if (images.length > BATCH_SIZE) {
            fullText += `\n\n--- Pagine ${batchStart}-${batchEnd} ---\n\n`
          }
          fullText += extractedText

          if (onChunk) {
            onChunk(extractedText, fullText)
          }
        }
        
        break  // Successo, esci dal loop retry

      } catch (error) {
        lastError = error
        if (isRetriableError(error, error.status) && attempt < MAX_RETRIES - 1) {
          await sleep(getRetryDelay(attempt))
          continue
        }
        throw error
      }
    }
  }

  if (!fullText.trim()) {
    throw new Error('Nessun testo estratto dalle immagini.')
  }

  return fullText.trim()
}

/**
 * OCR con Gemini (fallback)
 */
async function performOCRWithGeminiFallback({ images, mimeType, fileName, onChunk }) {
  const geminiKey = getGeminiApiKey()
  if (!geminiKey) {
    throw new Error('Chiave API Gemini mancante.')
  }

  const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
  let fullText = ''
  const BATCH_SIZE = 10 // Batch più grande per velocità
  
  for (let i = 0; i < images.length; i += BATCH_SIZE) {
    const batch = images.slice(i, i + BATCH_SIZE)
    const batchStart = i + 1
    const batchEnd = Math.min(i + BATCH_SIZE, images.length)
    
    if (onChunk) {
      onChunk('', `Riconoscimento ottico dei caratteri in corso\nAnalisi pagine ${batchStart}-${batchEnd} di ${images.length}...\n\nElaborazione in corso per garantire la massima accuratezza.`)
    }
    
    const parts = []
    
    batch.forEach((imageBase64) => {
      const base64Data = imageBase64.includes(',') 
        ? imageBase64.split(',')[1] 
        : imageBase64
      
      parts.push({
        inline_data: {
          mime_type: mimeType,
          data: base64Data
        }
      })
    })
    
    const pageInfo = batch.length > 1 
      ? `Pagine ${batchStart}-${batchEnd} di un documento.` 
      : `Pagina ${batchStart} di un documento.`
    
    parts.push({
      text: `${OCR_SYSTEM_PROMPT}\n\n${pageInfo}${fileName ? ` File: ${fileName}` : ''}\n\nEstrai tutto il testo visibile:`
    })

    let lastError = null
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(`${GEMINI_API_URL}?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 16000,  // Aumentato da 8192 per non troncare documenti lunghi
            }
          })
        })
        
        if (!response.ok) {
          const errorText = await response.text()
          lastError = new Error(`Gemini API error (${response.status}): ${errorText}`)
          
          if (response.status === 429 || response.status >= 500) {
            await sleep(getRetryDelay(attempt))
            continue
          }
          throw lastError
        }
        
        const data = await response.json()
        const extractedText = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
        
        if (extractedText) {
          if (images.length > BATCH_SIZE) {
            fullText += `\n\n--- Pagine ${batchStart}-${batchEnd} ---\n\n`
          }
          fullText += extractedText
          
          if (onChunk) {
            onChunk(extractedText, fullText)
          }
        }
        
        break  // Successo

      } catch (error) {
        lastError = error
        if (attempt < MAX_RETRIES - 1) {
          await sleep(getRetryDelay(attempt))
          continue
        }
      }
    }
    
    if (lastError && i === images.length - BATCH_SIZE) {
      throw lastError
    }
  }
  
  if (!fullText.trim()) {
    throw new Error('Nessun testo estratto dalle immagini.')
  }
  
  return fullText.trim()
}

// ===== RAG-ENHANCED CHAT =====

/**
 * Costruisce messaggi per chat con contesto RAG
 */
const buildRAGChatMessages = (question, ragContext, conversationHistory = []) => {
  const messages = [
    {
      role: 'system',
      content: CHAT_PROMPT + `\n\nIMPORTANTE: Ti vengono forniti estratti rilevanti dai documenti dell'utente, selezionati automaticamente in base alla domanda. Rispondi basandoti SOLO su questi estratti. Se la risposta non e' presente negli estratti, dillo chiaramente.`
    },
  ]

  // Aggiungi contesto RAG se presente
  if (ragContext && ragContext.trim()) {
    messages.push({
      role: 'user',
      content: `Estratti rilevanti dai documenti:\n\n${ragContext}`
    })
  }

  // Aggiungi cronologia (solo ultimi 6 messaggi per risparmiare token)
  const recentHistory = conversationHistory.slice(-6)
  recentHistory.forEach((msg) => {
    if (msg.role === 'user' || msg.role === 'assistant') {
      // Evita di includere nuovamente il contesto RAG
      const content = msg.content || msg.text || ''
      if (!content.includes('Estratti rilevanti dai documenti:')) {
        messages.push({
          role: msg.role,
          content: content.substring(0, 4000), // Limita messaggi lunghi
        })
      }
    }
  })

  // Aggiungi la domanda
  if (question) {
    messages.push({
      role: 'user',
      content: question,
    })
  }

  return messages
}

/**
 * Chat con RAG: usa contesto semantico invece di tutto il documento
 */
export function generateChatWithRAG({ apiKey, question, ragContext, conversationHistory = [], onChunk = () => {} }) {
  const messages = buildRAGChatMessages(question, ragContext, conversationHistory)
  return callOpenAIStreaming(apiKey, messages, onChunk)
}

/**
 * Analisi specializzata con RAG
 */
export function generateSpecializedAnalysisWithRAG({ apiKey, ragContext, actionId, userPrompt = '', onChunk = () => {} }) {
  if (!ragContext || !ragContext.trim()) {
    throw new Error('Contesto RAG non disponibile per l\'analisi.')
  }
  if (!actionId || !PROMPTS[actionId]) {
    throw new Error(`Azione non valida: ${actionId}`)
  }
  
  const messages = [
    {
      role: 'system',
      content: PROMPTS[actionId] + `\n\nNOTA: Ti vengono forniti estratti selezionati automaticamente dai documenti. Basa la tua analisi esclusivamente su questi estratti.`
    },
    {
      role: 'user',
      content: `Estratti dai documenti:\n\n${ragContext}`
    }
  ]
  
  if (userPrompt) {
    messages.push({
      role: 'user',
      content: `Richiesta specifica: ${userPrompt}`
    })
  }
  
  return callOpenAIStreaming(apiKey, messages, onChunk)
}