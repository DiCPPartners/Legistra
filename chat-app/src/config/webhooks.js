const isDev = import.meta.env?.DEV

export const WEBHOOK_URLS = isDev
  ? {
      trascrizione: '/api/trascrizione',
      storia: '/api/storia',
    }
  : {
      trascrizione: 'https://n8n.srv1103066.hstgr.cloud/webhook/trascrizione',
      storia: 'https://n8n.srv1103066.hstgr.cloud/webhook/storia',
    }

export const MODE_OPTIONS = [
  {
    id: 'trascrizione',
    label: 'Trascrizione Documentale',
    description: "Trasforma l'audio o il testo in trascrizioni strutturate.",
    webhook: WEBHOOK_URLS.trascrizione,
  },
  {
    id: 'analisi-giuridica',
    label: 'Analisi Giuridica',
    description: 'Analisi giuridica completa con valutazione e parere.',
    webhook: WEBHOOK_URLS.storia,
  },
  {
    id: 'timeline-eventi',
    label: 'Cronologia Processuale',
    description: 'Crea la cronologia temporale degli eventi processuali',
  },
  {
    id: 'analisi-coerenza',
    label: 'Coerenza Documentale',
    description: 'Verifica coerenza tra atti, provvedimenti e documenti',
  },
  {
    id: 'responsabilita-professionale',
    label: 'Malpractice Preliminare',
    description: 'Valuta aderenza a norme professionali e deontologiche',
  },
]

// ===== LIMITI FILE =====
export const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024 // 500 MB per singolo file
export const MAX_FILES_COUNT = 30 // Numero massimo di file simultanei
export const MAX_TOTAL_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024 // 2 GB dimensione totale per conversazione
export const WARNING_FILE_COUNT_THRESHOLD = 15 // Avviso quando si raggiungono 15 file (75% del limite)
export const WARNING_FILE_SIZE_THRESHOLD = 0.8 // Avviso quando si raggiunge l'80% della dimensione massima

// ===== LIMITI CONVERSAZIONI =====
export const MAX_CONVERSATIONS = 50 // Numero massimo di conversazioni per utente
export const WARNING_CONVERSATIONS_THRESHOLD = 40 // Avviso quando si raggiungono 40 conversazioni (80% del limite)

// ===== LIMITI TEMPLATE =====
export const MAX_TEMPLATES_PER_CATEGORY = 20 // Numero massimo di template per categoria
export const MAX_TOTAL_TEMPLATES = 100 // Numero massimo totale di template per utente
export const WARNING_TEMPLATES_THRESHOLD = 0.8 // Avviso quando si raggiunge l'80% del limite template

// ===== LIMITI MESSAGGI =====
export const MAX_MESSAGE_LENGTH = 10000 // Caratteri massimi per messaggio utente
export const WARNING_MESSAGE_LENGTH_THRESHOLD = 8000 // Avviso quando si raggiungono 8000 caratteri

// ===== CONFIGURAZIONE WEBHOOK =====
export const WEBHOOK_TIMEOUT_MS = 30 * 60 * 1000 // 30 minuti timeout
export const WEBHOOK_RETRY_ATTEMPTS = 2 // Numero di tentativi in caso di errore
export const WEBHOOK_RETRY_DELAY_MS = 3000 // 3 secondi tra i tentativi
export const DATA_RETENTION_DAYS = 7 // I dati vengono eliminati dopo 7 giorni

export const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY ?? ''

// ===== FUNZIONI DI UTILITÀ PER LIMITI =====
export const formatFileSize = (bytes) => {
  // Gestisci valori undefined, null, NaN o negativi
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes < 0) return '0 B'
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  // Verifica che l'indice sia valido
  if (i < 0 || i >= sizes.length || isNaN(i)) return '0 B'
  const value = bytes / Math.pow(k, i)
  if (isNaN(value)) return '0 B'
  return `${value.toFixed(2)} ${sizes[i]}`
}

export const getFileSizePercentage = (currentSize, maxSize) => {
  return Math.min((currentSize / maxSize) * 100, 100)
}
