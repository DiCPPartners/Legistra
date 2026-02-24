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
    label: 'Trascrizione',
    description: 'Estrai e formatta il testo dai documenti PDF.',
    webhook: WEBHOOK_URLS.trascrizione,
  },
  {
    id: 'analisi-giuridica',
    label: 'Parere Pro Veritate',
    description: 'Genera un parere legale completo con analisi e strategia.',
    webhook: WEBHOOK_URLS.storia,
  },
  {
    id: 'analisi-contrattuale',
    label: 'Analisi Contratto',
    description: 'Esamina clausole, rischi e inadempimenti contrattuali.',
  },
  {
    id: 'elementi-critici',
    label: 'Strategia Difensiva',
    description: 'Punti di forza, debolezze e strategia processuale.',
  },
  {
    id: 'timeline-eventi',
    label: 'Cronologia Atti',
    description: 'Ricostruisci la timeline di fatti, atti e scadenze.',
  },
  {
    id: 'estrazione-dati',
    label: 'Estrazione Dati',
    description: 'Estrai parti, importi, date e dati chiave.',
  },
  {
    id: 'confronto-documenti',
    label: 'Confronto Documenti',
    description: 'Confronta documenti per incongruenze.',
  },
  {
    id: 'report-strutturato',
    label: 'Bozza Atto',
    description: 'Genera bozza di atto giudiziario.',
  },
]

// ===== LIMITI FILE =====
export const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024
export const MAX_FILES_COUNT = 30
export const MAX_TOTAL_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024
export const WARNING_FILE_COUNT_THRESHOLD = 15
export const WARNING_FILE_SIZE_THRESHOLD = 0.8

// ===== LIMITI CONVERSAZIONI =====
export const MAX_CONVERSATIONS = 50
export const WARNING_CONVERSATIONS_THRESHOLD = 40

// ===== LIMITI TEMPLATE =====
export const MAX_TEMPLATES_PER_CATEGORY = 20
export const MAX_TOTAL_TEMPLATES = 100
export const WARNING_TEMPLATES_THRESHOLD = 0.8

// ===== LIMITI MESSAGGI =====
export const MAX_MESSAGE_LENGTH = 10000
export const WARNING_MESSAGE_LENGTH_THRESHOLD = 8000

// ===== CONFIGURAZIONE WEBHOOK =====
export const WEBHOOK_TIMEOUT_MS = 30 * 60 * 1000
export const WEBHOOK_RETRY_ATTEMPTS = 2
export const WEBHOOK_RETRY_DELAY_MS = 3000
export const DATA_RETENTION_DAYS = 7

export const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY ?? ''

// ===== FUNZIONI DI UTILITÀ PER LIMITI =====
export const formatFileSize = (bytes) => {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes < 0) return '0 B'
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  if (i < 0 || i >= sizes.length || isNaN(i)) return '0 B'
  const value = bytes / Math.pow(k, i)
  if (isNaN(value)) return '0 B'
  return `${value.toFixed(2)} ${sizes[i]}`
}

export const getFileSizePercentage = (currentSize, maxSize) => {
  return Math.min((currentSize / maxSize) * 100, 100)
}
