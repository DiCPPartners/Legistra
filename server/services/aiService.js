/**
 * AI Service
 * Gestisce chiamate a OpenAI e Gemini per OCR e elaborazione testo
 */

const OPENAI_API_KEY = process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY

const OCR_PROMPT = `Sei un sistema OCR di precisione professionale specializzato in documenti medico-legali.

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
 * Chiama OpenAI API
 */
export async function callOpenAI({ messages, model = 'gpt-4o-mini', maxTokens = 8000, onProgress = () => {} }) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY non configurata')
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.1
    })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(`OpenAI API error: ${response.status} - ${error.error?.message || 'Unknown error'}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

/**
 * Esegue OCR su array di immagini
 * OTTIMIZZATO COSTI: Gemini (gratuito) come primario, GPT-4o Vision come fallback
 */
export async function performOCR(images, fileName, onProgress = () => {}) {
  if (!images || images.length === 0) {
    throw new Error('Nessuna immagine da elaborare')
  }

  // Debug: verifica se le chiavi sono disponibili
  const hasGeminiKey = !!GEMINI_API_KEY
  const hasOpenAIKey = !!OPENAI_API_KEY
  
  if (!hasGeminiKey && !hasOpenAIKey) {
    console.error('OCR Error: Nessuna API key trovata', {
      VITE_GEMINI_API_KEY: !!process.env.VITE_GEMINI_API_KEY,
      GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
      VITE_OPENAI_API_KEY: !!process.env.VITE_OPENAI_API_KEY,
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    })
  }

  // Prova prima Gemini (GRATUITO e ottimo per OCR)
  if (GEMINI_API_KEY) {
    try {
      return await performOCRWithGemini(images, fileName, onProgress)
    } catch (error) {
      console.warn('Gemini OCR failed, trying GPT-4o:', error.message)
      // Fallback a GPT-4o per casi difficili
      if (OPENAI_API_KEY) {
        return await performOCRWithGPT4(images, fileName, onProgress)
      }
      throw error
    }
  }

  // Se non c'è Gemini, usa GPT-4o
  if (OPENAI_API_KEY) {
    return await performOCRWithGPT4(images, fileName, onProgress)
  }

  throw new Error('Nessuna API key configurata per OCR. Il documento sembra essere una scansione e richiede OCR. Configura VITE_GEMINI_API_KEY (gratuito, consigliato) o VITE_OPENAI_API_KEY nel file chat-app/.env e riavvia il server.')
}

/**
 * OCR con GPT-4o Vision
 */
async function performOCRWithGPT4(images, fileName, onProgress) {
  const BATCH_SIZE = 8 // 8 pagine per richiesta
  let fullText = ''

  for (let i = 0; i < images.length; i += BATCH_SIZE) {
    const batch = images.slice(i, i + BATCH_SIZE)
    const batchStart = i + 1
    const batchEnd = Math.min(i + BATCH_SIZE, images.length)

    onProgress(
      (i / images.length) * 100,
      `OCR pagine ${batchStart}-${batchEnd} di ${images.length}...`
    )

    // Costruisci contenuto con immagini
    const content = [
      { type: 'text', text: `Documento: ${fileName}\nPagine ${batchStart}-${batchEnd}. Estrai tutto il testo.` }
    ]

    batch.forEach((imageBase64, idx) => {
      const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${base64Data}`,
          detail: 'high'
        }
      })
    })

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: OCR_PROMPT },
          { role: 'user', content }
        ],
        max_tokens: 16000,
        temperature: 0.1
      })
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(`GPT-4o Vision error: ${response.status} - ${error.error?.message || 'Unknown'}`)
    }

    const data = await response.json()
    const extractedText = data.choices?.[0]?.message?.content || ''

    if (extractedText) {
      if (images.length > BATCH_SIZE) {
        fullText += `\n\n--- Pagine ${batchStart}-${batchEnd} ---\n\n`
      }
      fullText += extractedText
    }
  }

  return fullText.trim()
}

/**
 * OCR con Gemini (fallback)
 */
async function performOCRWithGemini(images, fileName, onProgress) {
  const BATCH_SIZE = 10
  let fullText = ''

  const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

  for (let i = 0; i < images.length; i += BATCH_SIZE) {
    const batch = images.slice(i, i + BATCH_SIZE)
    const batchStart = i + 1
    const batchEnd = Math.min(i + BATCH_SIZE, images.length)

    onProgress(
      (i / images.length) * 100,
      `OCR Gemini pagine ${batchStart}-${batchEnd} di ${images.length}...`
    )

    const parts = []

    batch.forEach((imageBase64) => {
      const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
      parts.push({
        inline_data: {
          mime_type: 'image/jpeg',
          data: base64Data
        }
      })
    })

    parts.push({
      text: `${OCR_PROMPT}\n\nDocumento: ${fileName}\nPagine ${batchStart}-${batchEnd}. Estrai tutto il testo visibile.`
    })

    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 16000
        }
      })
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(`Gemini error: ${response.status} - ${error.error?.message || 'Unknown'}`)
    }

    const data = await response.json()
    const extractedText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    if (extractedText) {
      if (images.length > BATCH_SIZE) {
        fullText += `\n\n--- Pagine ${batchStart}-${batchEnd} ---\n\n`
      }
      fullText += extractedText
    }
  }

  return fullText.trim()
}
