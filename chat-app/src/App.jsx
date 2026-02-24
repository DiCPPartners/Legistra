import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import ChatHistory from './components/ChatHistory'
import MessageComposer from './components/MessageComposer'
import Sidebar from './components/Sidebar'
import MedicalLegalActions from './components/MedicalLegalActions'
import DocumentTemplates from './components/DocumentTemplates'
import LegislationSearch from './components/LegislationSearch'
// STRIPE_DISABLED: Import SubscriptionPlans commentato temporaneamente
// import SubscriptionPlans from './components/SubscriptionPlans'
import DocumentSelector from './components/DocumentSelector'
import {
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_COUNT,
  MAX_TOTAL_FILE_SIZE_BYTES,
  MAX_MESSAGE_LENGTH,
  MAX_CONVERSATIONS,
  WARNING_CONVERSATIONS_THRESHOLD,
  WEBHOOK_TIMEOUT_MS,
  WEBHOOK_RETRY_ATTEMPTS,
  WEBHOOK_RETRY_DELAY_MS,
  MODE_OPTIONS,
  OPENAI_API_KEY,
  WEBHOOK_URLS,
  formatFileSize,
} from './config/webhooks'
import { 
  formatWorkflowOutput, 
  generateChatCompletion, 
  generateChatCompletionStreaming,
  generateChatWithRAG,
  generateMedicalLegalAnalysis, 
  generateSpecializedAnalysis,
  generateSpecializedAnalysisStreaming,
  generateSpecializedAnalysisWithRAG,
  generateDocumentWithStyle,
  generateDocumentWithStyleStreaming,
  reviewDocument,
  transcribeWithFallback,
  isGeminiTranscriptionAvailable,
  getRecommendedTranscriptionModel,
  performOCRWithGemini,
  isGeminiVisionAvailable,
} from './services/openai'
import { searchLegislationForContext } from './services/legislation'
import { 
  indexMultipleDocuments, 
  buildRAGContext, 
  hasIndexedChunks 
} from './services/rag'
import { 
  extractTextFromPDF, 
  extractTextFromMultiplePDFs,
  getTextStats as getPdfTextStats,
  estimateProcessingTime as estimatePdfProcessingTime,
  convertPDFToImages,
} from './services/pdfExtractor'
import {
  extractTextFromWord,
  extractTextFromMultipleWordFiles,
  getTextStats as getWordTextStats,
  estimateProcessingTime as estimateWordProcessingTime,
  isValidWordFile,
} from './services/wordExtractor'
import { getTemplatesForGeneration, fetchCategories } from './services/templates'
import { saveAnalysisVersion, getActionTypeLabel } from './services/versions'
import {
  initBackendConnection,
  isBackendAvailable,
  uploadDocumentsToBackend,
  checkBatchStatus,
  onBackendEvent,
  disconnectBackend
} from './services/backendClient'
import { PROMPTS } from './config/prompts'
import { supabase } from './services/supabaseClient'
import AuthLayout from './components/AuthLayout'
import LandingPage from './components/LandingPage'
import ProfileDialog from './components/ProfileDialog'
import ResetPassword from './components/ResetPassword'
import TerminiECondizioni from './components/TerminiECondizioni'
import PrivacyPolicy from './components/PrivacyPolicy'
import CookiePolicy from './components/CookiePolicy'

const createId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

/**
 * Trasforma errori tecnici in messaggi user-friendly
 */
const formatUserFriendlyError = (error) => {
  const message = error?.message || String(error) || 'Errore sconosciuto'
  
  // Errori di rete
  if (message.includes('fetch') || message.includes('network') || message.includes('NetworkError')) {
    return 'Connessione internet non disponibile. Verifica la tua connessione e riprova.'
  }
  
  // Timeout
  if (message.includes('timeout') || message.includes('Timeout')) {
    return 'La richiesta ha impiegato troppo tempo. Riprova tra qualche istante.'
  }
  
  // Rate limit OpenAI/API
  if (message.includes('429') || message.includes('rate limit') || message.includes('Rate limit')) {
    return 'Troppe richieste in poco tempo. Attendi qualche secondo e riprova.'
  }
  
  // Quota esaurita
  if (message.includes('quota') || message.includes('insufficient_quota')) {
    return 'Quota API esaurita. Contatta il supporto per assistenza.'
  }
  
  // Errori di autenticazione API
  if (message.includes('401') || message.includes('Unauthorized') || message.includes('API key')) {
    return 'Errore di configurazione del sistema. Contatta il supporto.'
  }
  
  // Server errors
  if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
    return 'I server sono temporaneamente non disponibili. Riprova tra qualche minuto.'
  }
  
  // Errori di parsing PDF
  if (message.includes('PDF') && (message.includes('parse') || message.includes('extract') || message.includes('corrupted'))) {
    return 'Il file PDF potrebbe essere danneggiato o protetto. Prova con un altro file.'
  }
  
  // Errori OCR - configurazione mancante
  if (message.includes('API key') && (message.includes('OCR') || message.includes('Gemini') || message.includes('OpenAI'))) {
    return '⚠️ Documento scansionato rilevato\n\nPer elaborare documenti scansionati è necessario configurare una chiave API per l\'OCR:\n\n• Gemini (consigliato, gratuito): Aggiungi VITE_GEMINI_API_KEY nel file .env\n• OpenAI: Usa VITE_OPENAI_API_KEY (richiede quota)\n\nContatta il supporto per assistenza sulla configurazione.'
  }
  
  // Errori OCR generici
  if (message.includes('OCR') || message.includes('immagini')) {
    return 'Impossibile leggere il documento. Assicurati che sia leggibile e riprova.'
  }
  
  // Errori di trascrizione
  if (message.includes('trascrizione') || message.includes('Trascrizione')) {
    return 'Errore durante l\'elaborazione del documento. Riprova.'
  }
  
  // Se il messaggio è già relativamente user-friendly (breve e senza codici tecnici)
  if (message.length < 150 && !message.includes('Error:') && !message.includes('error (')) {
    return message
  }
  
  // Fallback generico
  return 'Si è verificato un errore. Riprova oppure contatta il supporto se il problema persiste.'
}

const createEmptyContext = () => ({
  documentBatches: [],
  activeBatchId: null,
  pendingAction: null,
})

const normalizeContext = (context) => {
  if (!context || typeof context !== 'object') {
    return createEmptyContext()
  }

  return {
    documentBatches: Array.isArray(context.documentBatches) ? context.documentBatches : [],
    activeBatchId: context.activeBatchId ?? null,
    pendingAction: context.pendingAction ?? null,
  }
}

const mapMessageRow = (row) => ({
  id: row.id,
  role: row.role,
  text: row.content,
  files: row.metadata?.files ?? [],
  metadata: row.metadata ?? {},
  timestamp: row.created_at,
  animateTyping: false,
})

const mapConversationRow = (row) => {
  const context = normalizeContext(row.context)
  const tableMessages = (row.conversation_messages ?? [])
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map(mapMessageRow)

  const contextMessages = Array.isArray(row.context?.messages)
    ? row.context.messages.map((message) => ({
        id: message.id ?? createId(),
        role: message.role,
        text: message.text ?? '',
        files: Array.isArray(message.files) ? message.files : [],
        metadata: message.metadata ?? {},
        timestamp: message.timestamp ?? new Date().toISOString(),
        animateTyping: false,
      }))
    : null

  const resolvedMessages = tableMessages.length ? tableMessages : contextMessages ?? []

  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages: resolvedMessages,
    context,
  }
}

const validateFile = (file) => {
  if (!file) return 'File non valido.'
  
  // Verifica se è PDF
  const isPdf = file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')
  // Verifica se è Word
  const isWord = isValidWordFile(file)
  
  if (!isPdf && !isWord) {
    return `Il file "${file.name}" non è un formato supportato. Carica file PDF (.pdf) o Word (.docx, .doc).`
  }
  
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `Il file "${file.name}" (${formatFileSize(file.size)}) supera il limite di ${formatFileSize(MAX_FILE_SIZE_BYTES)} per singolo file.`
  }
  
  return null
}

const normalizeText = (value) => {
  if (typeof value !== 'string') {
    return value
  }

  // Normalizza sequenze di escape comuni senza usare JSON.parse (che può corrompere il testo)
  return value
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
}

const extractArrayText = (payload) => {
  if (!Array.isArray(payload)) return ''

  return payload
    .map((item) => {
      if (typeof item === 'string') {
        return normalizeText(item).trim()
      }

      if (item && typeof item === 'object') {
        const candidate = extractTextFromObject(item)
        if (candidate) {
          return candidate
        }
      }

      return normalizeText(String(item)).trim()
    })
    .filter(Boolean)
    .join('\n\n')
}

const extractTextFromObject = (value, visited = new Set()) => {
  if (!value || typeof value !== 'object' || visited.has(value)) {
    return ''
  }

  visited.add(value)

  const candidateKeys = ['text', 'message', 'result', 'output', 'content', 'transcription', 'transcript']
  for (const key of candidateKeys) {
    if (typeof value[key] === 'string') {
      const normalized = normalizeText(value[key]).trim()
      if (normalized) {
        return normalized
      }
    }
  }

  for (const key of Object.keys(value)) {
    const entry = value[key]
    if (typeof entry === 'string') {
      const normalized = normalizeText(entry).trim()
      if (normalized) {
        return normalized
      }
    } else if (Array.isArray(entry)) {
      const text = extractArrayText(entry)
      if (text) {
        return text
      }
    } else if (entry && typeof entry === 'object') {
      const nested = extractTextFromObject(entry, visited)
      if (nested) {
        return nested
      }
    }
  }

  if (Array.isArray(value)) {
    return extractArrayText(value)
  }

  return normalizeText(JSON.stringify(value)).trim()
}

const detectRequestedMode = (input) => {
  if (!input) return null
  const normalized = input.toLowerCase()

  if (/(trascr|sottotit|sbobin|trascriv)/.test(normalized)) {
    return 'trascrizione'
  }

  const containsAll = (terms) => terms.every((term) => normalized.includes(term))

  if (
    /(storia[\s-]*clinica|medico[\s-]*legale|perizia[\s-]*medic|perizia[\s-]*legale|valutazione[\s-]*medico)/.test(normalized) ||
    (normalized.includes('analisi') && (normalized.includes('medico') || normalized.includes('legale'))) ||
    normalized.includes('analizza in chiave medico') ||
    normalized.includes('analizza in chiave legale') ||
    containsAll(['valuta', 'medic']) ||
    containsAll(['valuta', 'legale']) ||
    containsAll(['studio', 'medico']) ||
    containsAll(['studio', 'clinico']) ||
    containsAll(['analizza', 'documento']) ||
    containsAll(['analisi', 'cartella'])
  ) {
    return 'analisi-giuridica'
  }

  return null
}

const removeDiacritics = (value) =>
  value
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    ?? ''

const toTokens = (value) => {
  if (!value) return []
  return removeDiacritics(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3)
}

const deriveBatchLabel = (files) => {
  if (!files?.length) {
    return `Documenti del ${new Date().toLocaleDateString('it-IT')}`
  }
  const first = files[0]?.name ?? 'Documenti'
  const baseName = removeDiacritics(first.replace(/\.[^/.]+$/, '')).trim()
  if (files.length === 1) {
    return baseName || 'Documento caricato'
  }
  return `${baseName || 'Documenti'} +${files.length - 1}`
}

const createDocumentBatch = ({ files, transcriptionText }) => {
  const label = deriveBatchLabel(files)
  const fileTokens = files.flatMap((file) => toTokens(file.name))
  const labelTokens = toTokens(label)
  const searchTokens = Array.from(new Set([...fileTokens, ...labelTokens]))

  return {
    id: createId(),
    createdAt: new Date().toISOString(),
    label,
    files: files.map((file) => ({ name: file.name, size: file.size ?? 0 })),
    originalFiles: [...files],
    transcriptionText: transcriptionText ?? '',
    analysisText: '',
    searchTokens,
  }
}

const findBatchByTokens = ({ text, batches, excludeBatchId }) => {
  if (!text || !batches?.length) return null
  const tokens = toTokens(text)
  if (!tokens.length) return null

  return (
    batches.find((batch) => {
      if (batch.id === excludeBatchId) return false
      const matches = batch.searchTokens?.filter((token) => tokens.includes(token)) ?? []
      if (matches.length >= 2) return true
      return matches.some((token) => token.length >= 4)
    }) ?? null
  )
}

const isAffirmativeResponse = (text) => {
  if (!text) return false
  const normalized = removeDiacritics(text.trim().toLowerCase())
  if (!normalized) return false
  const affirmatives = ['si', 'sì', 'ok', 'va bene', 'procedi', 'perfetto', 'confermo', 'prosegui', 'vai pure', 'continua']
  return affirmatives.some((word) => normalized === word || normalized.startsWith(`${word} `))
}

const isNegativeResponse = (text) => {
  if (!text) return false
  const normalized = removeDiacritics(text.trim().toLowerCase())
  if (!normalized) return false
  const negatives = ['no', 'non', 'annulla', 'ferma', 'stop', 'aspetta', 'cambia']
  return negatives.some((word) => normalized === word || normalized.startsWith(`${word} `))
}

const serializeMessagesForStorage = (messages) =>
  (messages ?? []).map((message) => ({
    id: message.id ?? createId(),
    role: message.role,
    text: message.text ?? '',
    files: Array.isArray(message.files) ? message.files : [],
    metadata: message.metadata ?? {},
    timestamp: message.timestamp ?? new Date().toISOString(),
  }))

const sanitizeDocumentFile = (file) => {
  if (!file || typeof file !== 'object') {
    return { name: '', size: 0 }
  }

  const name = typeof file.name === 'string' ? file.name : ''
  const size = typeof file.size === 'number' ? file.size : 0

  return { name, size }
}

const sanitizeDocumentBatches = (batches) =>
  Array.isArray(batches)
    ? batches.map((batch) => ({
        id: batch.id ?? createId(),
        createdAt: batch.createdAt ?? new Date().toISOString(),
        label: typeof batch.label === 'string' ? batch.label : 'Documenti caricati',
        files: Array.isArray(batch.files) ? batch.files.map(sanitizeDocumentFile) : [],
        transcriptionText: typeof batch.transcriptionText === 'string' ? batch.transcriptionText : '',
        analysisText: typeof batch.analysisText === 'string' ? batch.analysisText : '',
        searchTokens: Array.isArray(batch.searchTokens)
          ? batch.searchTokens.filter((token) => typeof token === 'string' && token.length > 0)
          : [],
      }))
    : []

const sanitizePendingAction = (pendingAction) => {
  if (!pendingAction || typeof pendingAction !== 'object') {
    return null
  }

  const { id, batchId, prompt, mode } = pendingAction

  return {
    id: typeof id === 'string' ? id : createId(),
    batchId: typeof batchId === 'string' ? batchId : null,
    prompt: typeof prompt === 'string' ? prompt : '',
    mode: typeof mode === 'string' ? mode : null,
  }
}

const sanitizeContextForStorage = (context) => {
  const base = createEmptyContext()
  const merged = {
    ...base,
    ...(context ?? {}),
  }

  return {
    ...merged,
    hasDocuments: Array.isArray(merged.documentBatches) ? merged.documentBatches.length > 0 : false,
    documentBatches: sanitizeDocumentBatches(merged.documentBatches),
    activeBatchId: typeof merged.activeBatchId === 'string' ? merged.activeBatchId : null,
    pendingAction: sanitizePendingAction(merged.pendingAction),
  }
}

const formatConversationTitle = (createdAt) => {
  const date = createdAt ? new Date(createdAt) : new Date()
  if (Number.isNaN(date.getTime())) {
    return `Chat ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`
  }
  const time = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  return `Chat ${time}`
}


function App() {
  const [session, setSession] = useState(null)
  const [isAuthReady, setIsAuthReady] = useState(false)
  const [userProfile, setUserProfile] = useState({ email: '', firstName: '', lastName: '' })
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [pathname, setPathname] = useState(() => window.location.pathname)
  const [conversations, setConversations] = useState([])
  const [activeConversationId, setActiveConversationId] = useState(null)
  const [draftText, setDraftText] = useState('')
  const [draftFiles, setDraftFiles] = useState([])
  const [isSending, setIsSending] = useState(false)
  const isSendingTimeoutRef = useRef(null)
  const [errorMessage, setErrorMessage] = useState(null)
  const [isLoadingConversations, setIsLoadingConversations] = useState(true)
  const [queuedWorkflow, setQueuedWorkflow] = useState(null)
  const [isActionsModalOpen, setIsActionsModalOpen] = useState(false)
  const [isDragOverChat, setIsDragOverChat] = useState(false)
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false)
  const [isLegislationOpen, setIsLegislationOpen] = useState(false)
  const [isSubscriptionOpen, setIsSubscriptionOpen] = useState(false)
  const [isDocumentSelectorOpen, setIsDocumentSelectorOpen] = useState(false)
  const [pendingTranscriptionFiles, setPendingTranscriptionFiles] = useState([])
  const [selectedDocumentForTranscription, setSelectedDocumentForTranscription] = useState(null)
  
  // Backend state per elaborazione server-side
  const [useBackend, setUseBackend] = useState(false)
  const [backendProcessing, setBackendProcessing] = useState(null) // {batchId, jobs, progress}
  const backendInitialized = useRef(false)
  
  // Ref per tracciare la generazione corrente e prevenire che richieste cancellate sovrascrivano messaggi
  const currentGenerationRef = useRef(null)
  
  // Ref per tracciare elaborazioni attive (persiste tra re-render E in localStorage per refresh)
  const activeProcessingRef = useRef((() => {
    try {
      const stored = localStorage.getItem('legistra_active_processing')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })())
  
  // Funzione per aggiornare activeProcessingRef con persistenza
  const setActiveProcessing = (data) => {
    activeProcessingRef.current = data
    try {
      if (data) {
        localStorage.setItem('legistra_active_processing', JSON.stringify(data))
      } else {
        localStorage.removeItem('legistra_active_processing')
      }
    } catch (e) {
      console.warn('Errore salvataggio stato elaborazione:', e)
    }
  }

  const createRemoteConversation = useCallback(async (title) => {
    const userId = session?.user?.id
    if (!userId) {
      throw new Error('Impossibile creare una conversazione senza un utente autenticato.')
    }

    const { data, error } = await supabase
      .from('conversations')
      .insert({ title, user_id: userId, context: createEmptyContext() })
      .select('id, title, created_at, updated_at, context')
      .single()

    if (error) {
      throw error
    }

    return mapConversationRow({ ...data, conversation_messages: [] })
  }, [session?.user?.id])

  const updateRemoteConversationTitle = useCallback(async (conversationId, title) => {
    const { error } = await supabase.from('conversations').update({ title }).eq('id', conversationId)
    if (error) {
      console.error('Errore durante l’aggiornamento del titolo della conversazione:', error)
    }
  }, [])

  const updateRemoteConversationContext = useCallback(async (conversationId, context, messages) => {
    const payload = {
      ...sanitizeContextForStorage(context),
      messages: serializeMessagesForStorage(messages),
    }

    const { error } = await supabase.from('conversations').update({ context: payload }).eq('id', conversationId)
    if (error) {
      console.error('Errore durante il salvataggio del contesto conversazione:', error)
    }
  }, [])

  const appendMessages = useCallback(async ({ conversationId, messages }) => {
    if (!conversationId || !messages?.length) {
      return []
    }

    const payload = messages.map((message) => ({
      conversation_id: conversationId,
      role: message.role,
      content: message.text ?? message.content ?? '',
      metadata: message.metadata ?? {},
    }))

    const { data, error } = await supabase
      .from('conversation_messages')
      .insert(payload)
      .select('id, role, content, metadata, created_at')

    if (error) {
      throw error
    }

    return data?.map(mapMessageRow) ?? []
  }, [])

  const deleteRemoteConversation = useCallback(async (conversationId) => {
    const { error } = await supabase.from('conversations').delete().eq('id', conversationId)
    if (error) {
      throw error
    }
  }, [])

  const updateRemoteMessage = useCallback(async (messageId, content) => {
    const { error } = await supabase
      .from('conversation_messages')
      .update({ content })
      .eq('id', messageId)

    if (error) {
      throw error
    }
  }, [])

  const deleteRemoteMessages = useCallback(async (messageIds) => {
    if (!messageIds?.length) return
    const { error } = await supabase
      .from('conversation_messages')
      .delete()
      .in('id', messageIds)

    if (error) {
      throw error
    }
  }, [])

  useEffect(() => {
    const handlePopstate = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', handlePopstate)
    return () => window.removeEventListener('popstate', handlePopstate)
  }, [])

  // Keep-alive avanzato per mantenere la tab attiva durante elaborazione in background
  useEffect(() => {
    let audioContext = null
    let oscillator = null
    let keepAliveInterval = null
    let wakeLock = null
    let webLockPromise = null

    const startKeepAlive = async () => {
      // 1. AudioContext silenzioso - previene throttling in molti browser
      try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)()
        oscillator = audioContext.createOscillator()
        const gainNode = audioContext.createGain()
        gainNode.gain.value = 0.0001 // Volume quasi zero
        oscillator.connect(gainNode)
        gainNode.connect(audioContext.destination)
        oscillator.frequency.value = 1 // Frequenza minima
        oscillator.start()
      } catch (e) {
        console.log('AudioContext non disponibile per keep-alive')
      }

      // 2. Wake Lock API - mantiene lo schermo attivo (se supportato)
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen')
        }
      } catch (e) {
        // Wake Lock non disponibile o rifiutato
      }

      // 3. Web Locks API - previene la sospensione della tab
      try {
        if ('locks' in navigator) {
          webLockPromise = navigator.locks.request('legistra-processing', { mode: 'exclusive' }, () => {
            // Mantieni il lock finché l'elaborazione è in corso
            return new Promise((resolve) => {
              // Questo lock verrà rilasciato quando stopKeepAlive viene chiamato
              keepAliveInterval = setInterval(() => {
                // Ping minimo per mantenere attivo il processo
                if (!isSending) {
                  resolve()
                }
              }, 500)
            })
          })
        }
      } catch (e) {
        // Web Locks non disponibile
      }

      // 4. Interval di backup per mantenere attivo il thread JS
      if (!keepAliveInterval) {
        keepAliveInterval = setInterval(() => {
          // Operazione minima per mantenere attivo il thread
          void 0
        }, 100)
      }
    }

    const stopKeepAlive = () => {
      if (oscillator) {
        try {
          oscillator.stop()
          oscillator.disconnect()
        } catch (e) {}
        oscillator = null
      }
      if (audioContext) {
        try {
          audioContext.close()
        } catch (e) {}
        audioContext = null
      }
      if (wakeLock) {
        try {
          wakeLock.release()
        } catch (e) {}
        wakeLock = null
      }
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval)
        keepAliveInterval = null
      }
      // webLockPromise si risolve automaticamente quando keepAliveInterval viene pulito
    }

    if (isSending) {
      startKeepAlive()
    } else {
      stopKeepAlive()
    }

    return () => stopKeepAlive()
  }, [isSending])

  // Safety timeout: resetta isSending se rimane bloccato per più di 10 minuti
  useEffect(() => {
    if (isSending) {
      // Pulisci timeout precedente
      if (isSendingTimeoutRef.current) {
        clearTimeout(isSendingTimeoutRef.current)
      }
      
      // Imposta nuovo timeout di sicurezza (10 minuti)
      isSendingTimeoutRef.current = setTimeout(() => {
        console.warn('isSending safety timeout triggered - resetting state')
        setIsSending(false)
        setBackendProcessing(null)
        setActiveProcessing(null)
        setErrorMessage('L\'elaborazione ha impiegato troppo tempo ed è stata interrotta. Riprova.')
      }, 10 * 60 * 1000) // 10 minuti
    } else {
      // Pulisci timeout quando isSending diventa false
      if (isSendingTimeoutRef.current) {
        clearTimeout(isSendingTimeoutRef.current)
        isSendingTimeoutRef.current = null
      }
    }
    
    return () => {
      if (isSendingTimeoutRef.current) {
        clearTimeout(isSendingTimeoutRef.current)
      }
    }
  }, [isSending])

  // Gestione visibilità pagina - ricarica sessione quando torna attiva
  // MA NON durante un'elaborazione in corso (per non sovrascrivere lo streaming)
  const isSendingRef = useRef(false)
  useEffect(() => { isSendingRef.current = isSending }, [isSending])
  
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        // Se c'è un'elaborazione in corso, NON ricaricare sessione/conversazioni
        if (isSendingRef.current || currentGenerationRef.current) {
          console.log('%c[VISIBILITY] Tab visibile ma elaborazione in corso, skip reload', 'color: #ff9800')
          return
        }
        // Ricarica la sessione per assicurarsi che sia ancora valida
        const { data } = await supabase.auth.getSession()
        if (data?.session) {
          setSession(data.session)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  useEffect(() => {
    let isMounted = true
    const initSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (!isMounted) return
        if (error) {
          console.error('Errore durante la lettura della sessione:', error)
          setSession(null)
          setUserProfile({ email: '', firstName: '', lastName: '' })
        } else {
          const nextSession = data?.session ?? null
          setSession(nextSession)
          if (nextSession?.user) {
            const { email = '', user_metadata: metadata = {} } = nextSession.user
            setUserProfile({
              email,
              firstName: metadata.first_name ?? '',
              lastName: metadata.last_name ?? '',
            })
          } else {
            setUserProfile({ email: '', firstName: '', lastName: '' })
          }
        }
      } catch (error) {
        if (!isMounted) return
        console.error('Errore inatteso durante la verifica della sessione:', error)
        setSession(null)
        setUserProfile({ email: '', firstName: '', lastName: '' })
      } finally {
        if (isMounted) {
          setIsAuthReady(true)
        }
      }
    }

    initSession()

    const {
      data: authListener,
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return
      setSession(nextSession)
      if (nextSession?.user) {
        const { email = '', user_metadata: metadata = {} } = nextSession.user
        setUserProfile({
          email,
          firstName: metadata.first_name ?? '',
          lastName: metadata.last_name ?? '',
        })
      } else {
        setUserProfile({ email: '', firstName: '', lastName: '' })
      }
      setIsAuthReady(true)
    })

    return () => {
      isMounted = false
      authListener?.subscription?.unsubscribe?.()
    }
  }, [])

  // Inizializza backend per elaborazione server-side
  useEffect(() => {
    if (!session?.user?.id || backendInitialized.current) return
    
    const initBackend = async () => {
      const available = await isBackendAvailable()
      if (available) {
        console.log('Backend server available - using server-side processing')
        setUseBackend(true)
        initBackendConnection(session.user.id)
        backendInitialized.current = true
        
        // Gestori eventi real-time
        onBackendEvent('job:progress', (data) => {
          setBackendProcessing(prev => ({
            ...prev,
            currentJob: data.fileName,
            progress: data.progress,
            message: data.message
          }))
        })
        
        onBackendEvent('batch:complete', (data) => {
          console.log('Batch complete:', data.batchId)
        })
      } else {
        console.log('Backend not available - using client-side processing')
        setUseBackend(false)
      }
    }
    
    initBackend()
    
    return () => {
      disconnectBackend()
      backendInitialized.current = false
    }
  }, [session?.user?.id])

  // Recupera stato elaborazione quando l'utente torna alla pagina
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && activeProcessingRef.current) {
        const { batchId, loaderId, conversationId, totalFiles } = activeProcessingRef.current
        
        try {
          const status = await checkBatchStatus(batchId)
          
          // Aggiorna il messaggio con lo stato attuale
          if (status.status === 'completed' || status.status === 'error') {
            // Elaborazione completata mentre eri via
            const successCount = status.jobs?.filter(j => j.status === 'completed').length || 0
            
            setConversations(prev => prev.map(conv => {
              if (conv.id !== conversationId) return conv
              return {
                ...conv,
                messages: conv.messages.map(msg => 
                  msg.id === loaderId 
                    ? { ...msg, text: `**Elaborazione completata**\n\n${successCount} di ${totalFiles} documenti elaborati.`, isLoading: false, isStreaming: false }
                    : msg
                )
              }
            }))
            
            setActiveProcessing(null)
            setBackendProcessing(null)
          } else {
            // Ancora in elaborazione
            const completed = status.jobs?.filter(j => j.status === 'completed').length || 0
            const processing = status.jobs?.filter(j => j.status === 'processing').length || 0
            
            setConversations(prev => prev.map(conv => {
              if (conv.id !== conversationId) return conv
              return {
                ...conv,
                messages: conv.messages.map(msg => 
                  msg.id === loaderId 
                    ? { ...msg, text: `**Elaborazione in background**\n\nCompletati: ${completed}/${totalFiles}\nIn corso: ${processing}\n\n*L'elaborazione continua in background.*`, isLoading: false, isStreaming: true }
                    : msg
                )
              }
            }))
          }
        } catch (e) {
          console.warn('Error checking batch status on visibility change:', e)
        }
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [setActiveProcessing])

  // Recupera stato elaborazione salvato dopo refresh della pagina
  const processingRecoveryDone = useRef(false)
  useEffect(() => {
    if (processingRecoveryDone.current) return
    if (conversations.length === 0) return
    
    processingRecoveryDone.current = true
    
    const checkSavedProcessing = async () => {
      try {
        const stored = localStorage.getItem('legistra_active_processing')
        if (!stored) return
        
        const savedProcessing = JSON.parse(stored)
        const { batchId, loaderId, conversationId, totalFiles } = savedProcessing
        
        if (!batchId) {
          localStorage.removeItem('legistra_active_processing')
          return
        }
        
        // Verifica lo stato corrente del batch
        const status = await checkBatchStatus(batchId)
        
        if (status.status === 'completed' || status.status === 'error') {
          // Elaborazione già completata, aggiorna UI
          const successCount = status.jobs?.filter(j => j.status === 'completed').length || 0
          
          setConversations(prev => prev.map(conv => {
            if (conv.id !== conversationId) return conv
            return {
              ...conv,
              messages: conv.messages.map(msg => 
                msg.id === loaderId 
                  ? { ...msg, text: `**Elaborazione completata**\n\n${successCount} di ${totalFiles} documenti elaborati.`, isLoading: false, isStreaming: false }
                  : msg
              )
            }
          }))
          
          setActiveProcessing(null)
        } else {
          // Ancora in elaborazione, ripristina lo stato
          activeProcessingRef.current = savedProcessing
          setBackendProcessing({
            batchId,
            progress: 0,
            total: totalFiles
          })
          
          // Aggiorna messaggio
          const completed = status.jobs?.filter(j => j.status === 'completed').length || 0
          setConversations(prev => prev.map(conv => {
            if (conv.id !== conversationId) return conv
            return {
              ...conv,
              messages: conv.messages.map(msg => 
                msg.id === loaderId 
                  ? { ...msg, text: `**Elaborazione in background**\n\nCompletati: ${completed}/${totalFiles}\n\n*Elaborazione ripresa dopo refresh.*`, isLoading: false, isStreaming: true }
                  : msg
              )
            }
          }))
        }
      } catch (e) {
        console.warn('Errore recupero stato elaborazione:', e)
        localStorage.removeItem('legistra_active_processing')
      }
    }
    
    checkSavedProcessing()
  }, [conversations.length, setActiveProcessing])

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/dc883744-306a-4dd9-9042-7007785805be',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.jsx:loadConversations-effect',message:'loadConversations useEffect TRIGGERED',data:{sessionId:session?.user?.id,isSending},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    let isCurrent = true

    const loadConversations = async () => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/dc883744-306a-4dd9-9042-7007785805be',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.jsx:loadConversations-start',message:'loadConversations CALLED - will overwrite conversations',data:{hasSession:!!session,isSending},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      if (!session) {
        if (!isCurrent) return
        setConversations([])
        setActiveConversationId(null)
        setDraftText('')
        setDraftFiles([])
        setErrorMessage(null)
        setIsProfileOpen(false)
        setIsLoadingConversations(false)
        return
      }

      setIsLoadingConversations(true)
      try {
        const { data, error } = await supabase
          .from('conversations')
          .select(
            `id, title, created_at, updated_at, context,
             conversation_messages (id, role, content, metadata, created_at)`
          )
          .order('updated_at', { ascending: false })
          .order('created_at', { ascending: true })

        if (!isCurrent) return

        if (error) {
          console.error('Errore durante il caricamento delle conversazioni:', error)
          setConversations([])
          setActiveConversationId(null)
          setIsLoadingConversations(false)
          return
        }

        if (data && data.length > 0) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/dc883744-306a-4dd9-9042-7007785805be',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.jsx:setConversations-fromDB',message:'OVERWRITING conversations with DB data - loader will be LOST',data:{numConversations:data.length,isSending},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          const mapped = data.map(mapConversationRow)
          // Se c'è un'elaborazione in corso, preserva i messaggi loader/streaming nella conversazione attiva
          setConversations((prev) => {
            const activeConv = prev.find(c => c.id === activeConversationId)
            const hasActiveStreaming = activeConv?.messages?.some(m => m.isLoading || m.isStreaming)
            console.log('%c[MSG-FLOW] loadConversations merging', 'color: #795548; font-weight: bold', {
              dbConversations: mapped.length,
              hasActiveStreaming,
              activeConvId: activeConv?.id?.slice(0, 8),
              activeMessages: activeConv?.messages?.length,
            })
            if (hasActiveStreaming && activeConv) {
              return mapped.map(conv => 
                conv.id === activeConv.id ? activeConv : conv
              )
            }
            return mapped
          })
          setActiveConversationId((prevId) => prevId ?? mapped[0]?.id ?? null)
          setIsLoadingConversations(false)
          return
        }

        const defaultTitle = `Chat ${new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}`
        try {
          const conversation = await createRemoteConversation(defaultTitle)
          if (!isCurrent) return
          setConversations([conversation])
          setActiveConversationId(conversation.id)
        } catch (insertError) {
          if (!isCurrent) return
          console.error('Errore durante la creazione della conversazione predefinita:', insertError)
          setConversations([])
          setActiveConversationId(null)
        }
      } finally {
        if (isCurrent) {
          setIsLoadingConversations(false)
        }
      }
    }

    loadConversations()

    return () => {
      isCurrent = false
    }
  }, [session, createRemoteConversation])

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0],
    [activeConversationId, conversations],
  )

  const messages = useMemo(() => activeConversation?.messages ?? [], [activeConversation])
  const context = activeConversation?.context ?? {}
  const documentBatches = useMemo(() => context.documentBatches ?? [], [context.documentBatches])
  const activeBatchId = context.activeBatchId ?? documentBatches?.slice(-1)[0]?.id ?? null
  const pendingAction = context.pendingAction ?? null

  // Debug: traccia cambiamenti nei messaggi della conversazione attiva
  const prevMessagesRef = useRef([])
  useEffect(() => {
    const prevMsgs = prevMessagesRef.current
    const currMsgs = messages
    if (prevMsgs.length !== currMsgs.length || prevMsgs.some((m, i) => m.id !== currMsgs[i]?.id)) {
      console.log('%c[MSG-STATE] Messages changed', 'color: #9c27b0; font-weight: bold', {
        prevCount: prevMsgs.length,
        currCount: currMsgs.length,
        messages: currMsgs.map(m => ({
          id: m.id?.slice(0, 12),
          role: m.role,
          isLoading: m.isLoading || false,
          isStreaming: m.isStreaming || false,
          hasError: !!m.error,
          textLen: m.text?.length || 0,
          textPreview: m.text?.slice(0, 40) || '(empty)',
        })),
      })
    }
    prevMessagesRef.current = currMsgs
  }, [messages])

  const handleFilesAdd = useCallback((incomingFiles) => {
    if (!incomingFiles?.length) return
    const errorMessages = []
    const validFiles = []

    // Controlla il numero totale di file (esistenti + nuovi)
    const currentFileCount = draftFiles.length
    const totalFileCount = currentFileCount + incomingFiles.length
    
    // Calcola dimensione totale attuale
    const currentTotalSize = draftFiles.reduce((sum, file) => sum + file.size, 0)

    if (totalFileCount > MAX_FILES_COUNT) {
      const remainingSlots = MAX_FILES_COUNT - currentFileCount
      if (remainingSlots > 0) {
        setErrorMessage(
          `Limite file quasi raggiunto: Puoi caricare massimo ${MAX_FILES_COUNT} file alla volta. Hai già ${currentFileCount} file selezionati. Puoi aggiungerne ancora ${remainingSlots}.`
        )
        // Aggiungi solo i file che rientrano nel limite
        incomingFiles.slice(0, remainingSlots).forEach((file) => {
          const validationError = validateFile(file)
          if (validationError) {
            errorMessages.push(validationError)
          } else {
            // Controlla dimensione totale prima di aggiungere
            const newTotalSize = currentTotalSize + file.size
            if (newTotalSize > MAX_TOTAL_FILE_SIZE_BYTES) {
              errorMessages.push(
                `Il file "${file.name}" farebbe superare il limite di dimensione totale (${formatFileSize(MAX_TOTAL_FILE_SIZE_BYTES)}). Dimensione attuale: ${formatFileSize(currentTotalSize)}, nuovo totale: ${formatFileSize(newTotalSize)}.`
              )
            } else {
              validFiles.push(file)
            }
          }
        })
      } else {
        setErrorMessage(
          `Limite file raggiunto: Hai già raggiunto il limite di ${MAX_FILES_COUNT} file. Rimuovi alcuni file prima di aggiungerne altri.`
        )
        return
      }
    } else {
      incomingFiles.forEach((file) => {
        const validationError = validateFile(file)
        if (validationError) {
          errorMessages.push(validationError)
        } else {
          // Controlla dimensione totale prima di aggiungere
          const newTotalSize = currentTotalSize + file.size
          if (newTotalSize > MAX_TOTAL_FILE_SIZE_BYTES) {
            errorMessages.push(
              `Il file "${file.name}" farebbe superare il limite di dimensione totale di ${formatFileSize(MAX_TOTAL_FILE_SIZE_BYTES)}. Dimensione attuale: ${formatFileSize(currentTotalSize)}, nuovo totale: ${formatFileSize(newTotalSize)}. Rimuovi alcuni file prima di aggiungere questo.`
            )
          } else {
            validFiles.push(file)
          }
        }
      })
    }

    if (errorMessages.length) {
      setErrorMessage((prev) => (prev ? `${prev} ${errorMessages.join(' ')}` : errorMessages.join(' ')))
    }

    if (validFiles.length) {
      setDraftFiles((prev) => [...prev, ...validFiles])
    }
  }, [draftFiles.length])

  const callWebhook = useCallback(async ({ webhookUrl, modeMeta, message, files, onProgress }) => {
    const formData = new FormData()
    if (modeMeta?.id) {
      formData.append('mode', modeMeta.id)
    }
    if (modeMeta?.label) {
      formData.append('modeLabel', modeMeta.label)
    }
    if (message) {
      formData.append('message', message)
    }
    files.forEach((file) => formData.append('files', file, file.name))

    // Calcola timeout basato sulla dimensione totale dei file
    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    const estimatedTime = Math.max(
      WEBHOOK_TIMEOUT_MS,
      Math.ceil(totalSize / (1024 * 1024)) * 60000 // ~1 minuto per MB
    )

    let lastError = null
    for (let attempt = 1; attempt <= WEBHOOK_RETRY_ATTEMPTS; attempt++) {
      try {
        // Crea AbortController per timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), estimatedTime)

        if (onProgress) {
          onProgress({ status: 'uploading', attempt, totalAttempts: WEBHOOK_RETRY_ATTEMPTS })
        }

        const response = await fetch(webhookUrl, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          // Se è un errore 413 (Payload Too Large), non ritentare
          if (response.status === 413) {
            throw new Error(
              `File troppo grande (${Math.round(totalSize / (1024 * 1024))} MB). Il server n8n ha un limite di payload. Verifica la configurazione N8N_PAYLOAD_SIZE_MAX.`
            )
          }
          // Se è un errore 504 (Gateway Timeout), ritenta
          if (response.status === 504 && attempt < WEBHOOK_RETRY_ATTEMPTS) {
            lastError = new Error(`Timeout del server (tentativo ${attempt}/${WEBHOOK_RETRY_ATTEMPTS}). Riprovo...`)
            await new Promise((resolve) => setTimeout(resolve, WEBHOOK_RETRY_DELAY_MS * attempt))
            continue
          }
          throw new Error(`Il server ha risposto con lo stato ${response.status}.`)
        }

        if (onProgress) {
          onProgress({ status: 'processing' })
        }

        const contentType = response.headers.get('content-type') || ''
        const bodyText = await response.text()

        if (onProgress) {
          onProgress({ status: 'completed' })
        }

        if (contentType.includes('application/json')) {
          try {
            return JSON.parse(bodyText)
          } catch (parseError) {
            console.warn('Impossibile decodificare JSON; utilizzo il testo originale.', parseError)
            return bodyText
          }
        }

        return bodyText
      } catch (error) {
        lastError = error
        if (error.name === 'AbortError') {
          if (attempt < WEBHOOK_RETRY_ATTEMPTS) {
            console.warn(`Timeout durante l'elaborazione (tentativo ${attempt}/${WEBHOOK_RETRY_ATTEMPTS}). Riprovo...`)
            await new Promise((resolve) => setTimeout(resolve, WEBHOOK_RETRY_DELAY_MS * attempt))
            continue
          }
          throw new Error(
            `Timeout dopo ${WEBHOOK_RETRY_ATTEMPTS} tentativi. Il file potrebbe essere troppo grande o il server troppo lento. Tempo massimo: ${Math.round(estimatedTime / 1000)} secondi.`
          )
        }
        // Se non è un errore di timeout, rilancia subito
        if (attempt === WEBHOOK_RETRY_ATTEMPTS) {
          throw error
        }
        // Altrimenti ritenta dopo un delay
        await new Promise((resolve) => setTimeout(resolve, WEBHOOK_RETRY_DELAY_MS * attempt))
      }
    }

    throw lastError || new Error('Errore sconosciuto durante la chiamata al webhook')
  }, [])

  const formatAssistantResponse = useCallback((payload) => {
    if (payload == null) {
      return {
        text: 'Il workflow ha risposto senza contenuto.',
      }
    }

    if (Array.isArray(payload)) {
      const extracted = extractArrayText(payload)
      return extracted
        ? { text: extracted }
        : { text: JSON.stringify(payload, null, 2) }
    }

    if (typeof payload === 'string') {
      const normalised = normalizeText(payload)
      const trimmed = normalised.trim()
      return {
        text: trimmed || 'Il workflow ha risposto senza contenuto testuale.',
      }
    }

    if (typeof payload === 'object') {
      const text = extractTextFromObject(payload)
      return text
        ? { text }
        : { text: JSON.stringify(payload, null, 2) }
    }

    return {
      text: String(payload),
    }
  }, [])

  const convertMessagesToOpenAIFormat = useCallback((messages) => {
    return messages
      .filter((msg) => {
        // Escludi messaggi di caricamento, errori e messaggi senza testo
        if (msg.isLoading || msg.error || !msg.text) {
          return false
        }
        // Includi solo messaggi user e assistant
        return msg.role === 'user' || msg.role === 'assistant'
      })
      .map((msg) => ({
        role: msg.role,
        content: msg.text || '',
      }))
  }, [])

  const handleSubmit = useCallback(async () => {
    if (isSending) return

    const trimmedInput = draftText.trim()
    const filesToSend = [...draftFiles]
    const currentConversationId = activeConversation?.id

    if (!currentConversationId) {
      setErrorMessage('Seleziona o crea una chat prima di inviare.')
      return
    }

    const hasExistingBatches = documentBatches.length > 0
    const hasAnyDocuments = filesToSend.length > 0 || hasExistingBatches

    if (!trimmedInput && !hasAnyDocuments) {
      setErrorMessage('Inserisci un messaggio o allega almeno un PDF prima di inviare.')
      return
    }

    // Valida lunghezza messaggio
    if (trimmedInput.length > MAX_MESSAGE_LENGTH) {
      setErrorMessage(
        `Il messaggio è troppo lungo (${trimmedInput.length} caratteri). Limite massimo: ${MAX_MESSAGE_LENGTH} caratteri. Accorcia il messaggio prima di inviare.`
      )
      return
    }

    // Valida numero massimo di file
    if (filesToSend.length > MAX_FILES_COUNT) {
      setErrorMessage(
        `Limite file raggiunto: Puoi caricare massimo ${MAX_FILES_COUNT} file alla volta. Hai selezionato ${filesToSend.length} file. Rimuovi ${filesToSend.length - MAX_FILES_COUNT} file per continuare.`
      )
      return
    }

    // Valida dimensione totale file
    const totalFileSize = filesToSend.reduce((sum, file) => sum + file.size, 0)
    if (totalFileSize > MAX_TOTAL_FILE_SIZE_BYTES) {
      setErrorMessage(
        `Dimensione totale eccessiva: La somma di tutti i file (${formatFileSize(totalFileSize)}) supera il limite di ${formatFileSize(MAX_TOTAL_FILE_SIZE_BYTES)}. Rimuovi alcuni file o riduci la loro dimensione.`
      )
      return
    }

    // Valida singoli file
    const invalidFile = filesToSend.map(validateFile).find((result) => result !== null)
    if (invalidFile) {
      setErrorMessage(`${invalidFile}`)
      return
    }

    let processingPrompt = trimmedInput
    let requestedModeId = queuedWorkflow?.modeId || detectRequestedMode(processingPrompt)
    let effectiveMode = null
    
    // Se è una categoria personalizzata, crea un effectiveMode fittizio
    if (requestedModeId?.startsWith('categoria-') || queuedWorkflow?.modeId === 'genera-documento-stile') {
      effectiveMode = {
        id: 'genera-documento-stile',
        label: queuedWorkflow?.categoryName || 'Documento Personalizzato',
      }
    } else {
      effectiveMode = requestedModeId != null ? MODE_OPTIONS.find((option) => option.id === requestedModeId) ?? null : null
    }

    let userDisplayText = trimmedInput
    if (!userDisplayText) {
      // Mostra sempre un messaggio descrittivo per le azioni AI
      if (effectiveMode?.id === 'trascrizione') {
        userDisplayText = 'Esegui trascrizione'
      } else if (effectiveMode?.id === 'analisi-giuridica') {
        userDisplayText = 'Genera parere pro veritate'
      } else if (effectiveMode?.id === 'genera-documento-stile') {
        userDisplayText = `Genera documento: ${queuedWorkflow?.categoryName || 'Personalizzato'}`
      } else if (effectiveMode?.label) {
        userDisplayText = `Esegui: ${effectiveMode.label}`
      } else if (queuedWorkflow?.categoryName) {
        userDisplayText = `Genera: ${queuedWorkflow.categoryName}`
      } else {
        userDisplayText = 'Elabora documenti'
      }
    }

    const userMessage = {
      id: createId(),
      role: 'user',
      text: userDisplayText,
      files: filesToSend.map((file) => ({ name: file.name, size: file.size })),
      timestamp: new Date().toISOString(),
    }
    const userMessagePayload = {
      role: 'user',
      text: userDisplayText,
      metadata: { files: filesToSend.map((file) => ({ name: file.name, size: file.size })) },
    }

    const loaderId = `loader-${createId()}`
    
    // Assegna un ID univoco a questa generazione per evitare che richieste cancellate sovrascrivano messaggi
    const generationId = createId()
    currentGenerationRef.current = generationId

    console.log('%c[MSG-FLOW] handleSubmit START', 'color: #e91e63; font-weight: bold', {
      generationId: generationId.slice(0, 8),
      loaderId: loaderId.slice(0, 16),
      conversationId: currentConversationId?.slice(0, 8),
      mode: effectiveMode?.id || 'chat',
      hasFiles: filesToSend.length > 0,
    })

    setDraftFiles([])

    let renamedTitle = null
    setConversations((prev) =>
      [...prev]
        .map((conversation) => {
          if (conversation.id !== currentConversationId) {
            return conversation
          }

          const shouldRename =
            !conversation.messages?.length ||
            conversation.title.startsWith('Nuova chat') ||
            conversation.title === 'Chat corrente'
          const autoTitle = formatConversationTitle(
            conversation.createdAt ?? conversation.messages?.[0]?.timestamp ?? userMessage.timestamp,
          )
          const nextTitle = shouldRename ? autoTitle : conversation.title

          if (shouldRename && nextTitle !== conversation.title) {
            renamedTitle = nextTitle
          }

          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/dc883744-306a-4dd9-9042-7007785805be',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.jsx:loader-created',message:'LOADER MESSAGE CREATED',data:{loaderId,conversationId:conversation.id},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          return {
            ...conversation,
            title: nextTitle,
            updatedAt: userMessage.timestamp,
            messages: [
              ...conversation.messages,
              userMessage,
              {
                id: loaderId,
                role: 'assistant',
                isLoading: true,
                text: 'In attesa della risposta del workflow...',
              },
            ],
          }
        })
        .sort((a, b) => {
          const timeA = new Date(a.updatedAt ?? a.messages?.slice(-1)[0]?.timestamp ?? a.createdAt).getTime()
          const timeB = new Date(b.updatedAt ?? b.messages?.slice(-1)[0]?.timestamp ?? b.createdAt).getTime()
          return timeB - timeA
        }),
    )
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/dc883744-306a-4dd9-9042-7007785805be',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.jsx:isSending-true',message:'Setting isSending=true',data:{loaderId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    setIsSending(true)
    setErrorMessage(null)

    appendMessages({
      conversationId: currentConversationId,
      messages: [userMessagePayload],
    }).catch((error) => {
      console.error('Errore durante il salvataggio del messaggio utente:', error)
    })

    if (renamedTitle) {
      updateRemoteConversationTitle(currentConversationId, renamedTitle).catch((error) => {
        console.error('Errore nell’aggiornamento del titolo:', error)
      })
    }

    const clonedBatches = documentBatches.map((batch) => ({
      ...batch,
      files: batch.files?.map((file) => ({ ...file })) ?? [],
      originalFiles: batch.originalFiles ? [...batch.originalFiles] : [],
      searchTokens: batch.searchTokens ?? [],
    }))

    let updatedDocumentBatches = clonedBatches
    let updatedActiveBatchId = activeBatchId ?? clonedBatches.slice(-1)[0]?.id ?? null
    let updatedPendingAction = pendingAction ?? null
    const hasDraftFiles = filesToSend.length > 0
    let usingPendingAction = false
    let latestMessagesForStorage = messages

    let finalized = false
    const finalize = ({ text = '', data, messagesToPersist = [], wasStreamed = false }) => {
      // Previeni chiamate multiple
      if (finalized) {
        console.warn('%c[MSG-FLOW] finalize DUPLICATE call blocked', 'color: #ff5722', { generationId: generationId.slice(0, 8) })
        return
      }
      
      // Se questa generazione è stata cancellata, non fare nulla
      if (currentGenerationRef.current !== generationId) {
        console.log('%c[MSG-FLOW] finalize BLOCKED (generazione cancellata)', 'color: #ff5722; font-weight: bold', {
          generationId: generationId.slice(0, 8),
          current: currentGenerationRef.current?.slice(0, 8),
        })
        setIsSending(false)
        return
      }
      
      finalized = true
      
      console.log('%c[MSG-FLOW] finalize CALLED', 'color: #4caf50; font-weight: bold', {
        generationId: generationId.slice(0, 8),
        loaderId: loaderId.slice(0, 16),
        textLen: text?.length || 0,
        wasStreamed,
        textPreview: text?.slice(0, 80),
      })
      
      // Reset isSending - finalize è l'ultimo passaggio
      setIsSending(false)
      
      const assistantMessage = {
        id: createId(),
        role: 'assistant',
        text: text ?? '',
        timestamp: new Date().toISOString(),
        animateTyping: !wasStreamed, // Non animare se già streamato
        wasStreamed, // Marca come streamato per evitare doppia animazione
      }

      if (data !== undefined) {
        assistantMessage.data = data
      }

      setConversations((prev) =>
        [...prev]
          .map((conversation) => {
            if (conversation.id !== currentConversationId) {
              return conversation
            }

            const loaderPresent = conversation.messages.some((message) => message.id === loaderId)
            const nextMessages = loaderPresent
              ? conversation.messages.map((message) => (message.id === loaderId ? assistantMessage : message))
              : [...conversation.messages, assistantMessage]

            latestMessagesForStorage = nextMessages

            return {
              ...conversation,
              messages: nextMessages,
              updatedAt: assistantMessage.timestamp,
              context: {
                hasDocuments: updatedDocumentBatches.length > 0,
                documentBatches: updatedDocumentBatches,
                activeBatchId: updatedActiveBatchId,
                pendingAction: updatedPendingAction,
              },
            }
          })
          .sort((a, b) => {
            const timeA = new Date(a.updatedAt ?? a.messages?.slice(-1)[0]?.timestamp ?? a.createdAt).getTime()
            const timeB = new Date(b.updatedAt ?? b.messages?.slice(-1)[0]?.timestamp ?? b.createdAt).getTime()
            return timeB - timeA
          }),
      )

      const persistedMessages = (messagesToPersist.length
        ? messagesToPersist
        : [
            {
              role: 'assistant',
              text: assistantMessage.text,
              metadata: data !== undefined ? { data } : {},
            },
          ]
      ).map((message) => ({
        ...message,
        text: message.text ?? '',
        metadata: message.metadata ?? (data !== undefined ? { data } : {}),
      }))

      appendMessages({ conversationId: currentConversationId, messages: persistedMessages }).catch((error) => {
        console.error('Errore durante il salvataggio dei messaggi:', error)
      })

      updateRemoteConversationContext(
        currentConversationId,
        {
          documentBatches: updatedDocumentBatches,
          activeBatchId: updatedActiveBatchId,
          pendingAction: updatedPendingAction,
        },
        latestMessagesForStorage,
      ).catch((error) => {
        console.error('Errore durante l’aggiornamento del contesto conversazione:', error)
      })
    }

    // Funzione per aggiornare il testo del loader progressivamente (streaming)
    let streamUpdateCount = 0
    const updateStreamingText = (fullText) => {
      // Se questa generazione è stata cancellata, non aggiornare
      if (currentGenerationRef.current !== generationId) {
        if (streamUpdateCount === 0) {
          console.log('%c[MSG-FLOW] updateStreamingText BLOCKED (cancellata)', 'color: #ff5722', { generationId: generationId.slice(0, 8) })
        }
        return
      }
      
      streamUpdateCount++
      // Log ogni 10 aggiornamenti per non saturare la console
      if (streamUpdateCount === 1 || streamUpdateCount % 10 === 0) {
        console.log('%c[MSG-FLOW] updateStreamingText', 'color: #2196f3', {
          generationId: generationId.slice(0, 8),
          loaderId: loaderId.slice(0, 16),
          updateCount: streamUpdateCount,
          textLen: fullText?.length || 0,
        })
      }
      
      setConversations((prev) =>
        prev.map((conversation) => {
          if (conversation.id !== currentConversationId) {
            return conversation
          }
          const loaderExists = conversation.messages.some(m => m.id === loaderId)
          if (!loaderExists && streamUpdateCount <= 2) {
            console.warn('%c[MSG-FLOW] LOADER NOT FOUND during streaming!', 'color: #f44336; font-weight: bold', {
              loaderId: loaderId.slice(0, 16),
              messageIds: conversation.messages.map(m => m.id?.slice(0, 12)),
            })
          }
          return {
            ...conversation,
            messages: conversation.messages.map((message) =>
              message.id === loaderId
                ? { ...message, text: fullText, isLoading: false, isStreaming: true }
                : message
            ),
          }
        })
      )
    }

    try {
      if (pendingAction) {
        if (isAffirmativeResponse(processingPrompt)) {
          usingPendingAction = true
          processingPrompt = pendingAction.prompt
          if (pendingAction.mode === 'analysis') {
            requestedModeId = 'analisi-giuridica'
          } else if (pendingAction.mode === 'transcription') {
            requestedModeId = 'trascrizione'
          } else {
            requestedModeId = detectRequestedMode(processingPrompt)
          }
          effectiveMode = requestedModeId != null ? MODE_OPTIONS.find((option) => option.id === requestedModeId) ?? null : null
          updatedPendingAction = null
          updatedActiveBatchId = pendingAction.batchId
        } else if (isNegativeResponse(processingPrompt)) {
          updatedPendingAction = null
          finalize({ text: 'Perfetto, dimmi pure quali documenti o quale set desideri utilizzare.' })
          setDraftText('')
          return
        } else {
          updatedPendingAction = pendingAction
          finalize({ text: 'Sono in attesa di una conferma (sì/no) per procedere con il set di documenti individuato.' })
          setDraftText('')
          return
        }
      }

      // ===== NUOVO SISTEMA TRASCRIZIONE FRONTEND CON GEMINI =====
      
      // Helper per determinare tipo file e chiamare estrattore appropriato
      const extractTextFromFile = async (file, onProgress) => {
        const fileName = file.name || 'Documento'
        const isPdf = file.type === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')
        const isWord = isValidWordFile(file)
        
        if (isPdf) {
          return await extractTextFromPDF(file, onProgress)
        } else if (isWord) {
          return await extractTextFromWord(file, onProgress)
        } else {
          throw new Error(`Formato file non supportato: ${fileName}`)
        }
      }
      
      // Trascrizione singolo file (frontend con Gemini, fallback a n8n per OCR)
      // silentMode: se true, mostra solo messaggi di stato senza il testo della trascrizione
      const performSingleTranscription = async (file, promptForWebhook, silentMode = false) => {
        const fileName = file.name || 'Documento'
        const isPdf = file.type === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')
        const isWord = isValidWordFile(file)
        
        try {
          // Step 1: Estrai testo dal file (PDF o Word)
          const fileType = isPdf ? 'PDF' : isWord ? 'Word' : 'Documento'
          updateStreamingText(`Analisi documento: ${fileName}\nVerifica del formato e estrazione contenuto...`)
          
          const extraction = await extractTextFromFile(file, () => {
            updateStreamingText(`Analisi documento: ${fileName}\nLettura pagine...`)
          })
          
          const { text: extractedText, pageCount, isScanned, avgCharsPerPage } = extraction
          
          // Se il file è scansionato (poco testo), usa GPT-4o Vision OCR
          // Nota: i file Word nativi non dovrebbero essere scansionati, ma gestiamo il caso
          if (isScanned || avgCharsPerPage < 50) {
            console.log(`File scansionato rilevato (${avgCharsPerPage} chars/pagina), uso OCR avanzato`)
            
            // Converti PDF in immagini per OCR
            if (isPdf) {
              updateStreamingText(`Analisi documento: ${fileName}\n\nDocumento scansionato rilevato.\nAvvio riconoscimento ottico dei caratteri (OCR).\n\nPer garantire un'elaborazione ottimale, si consiglia di mantenere questa finestra attiva.`)
              
              const { images, pageCount: totalPages, convertedPages } = await convertPDFToImages(file, {
                scale: 1.5, // Buon compromesso qualità/dimensione
                maxPages: 100, // Limite ragionevole
                onProgress: (pageNum, total) => {
                  updateStreamingText(`Analisi documento: ${fileName}\n\nPreparazione OCR: pagina ${pageNum} di ${total}`)
                },
              })
              
              if (convertedPages < totalPages) {
                console.warn(`Convertite solo ${convertedPages}/${totalPages} pagine per limiti di memoria`)
              }
              
              // Esegui OCR con GPT-4o Vision
              updateStreamingText(`Analisi documento: ${fileName}\n\nOCR in corso su ${images.length} pagine...\nElaborazione con intelligenza artificiale.`)
              
              const ocrText = await performOCRWithGemini({
                images,
                mimeType: 'image/jpeg',
                fileName,
                onChunk: silentMode ? undefined : (chunk, fullText) => {
                  updateStreamingText(fullText)
                },
              })
              
              return ocrText
            } else {
              // Per file Word scansionati (raro), segnala errore chiaro
              throw new Error(`Il file Word "${fileName}" sembra essere scansionato. Convertilo in PDF e ricaricalo.`)
            }
          }
          
          // Step 2: Valuta se il testo ha bisogno di pulizia AI
          const stats = isPdf ? getPdfTextStats(extractedText) : getWordTextStats(extractedText)
          
          // Se il testo è già ben formattato (buona densità di caratteri, poche anomalie),
          // salta la pulizia AI per velocizzare il processo
          const hasGoodFormatting = avgCharsPerPage > 500 && !extractedText.includes('\\n') && extractedText.split('\n').length > 5
          
          if (hasGoodFormatting && stats.charCount > 100) {
            console.log(`Trascrizione rapida ${fileName}: ${pageCount} pagine, ${stats.charCount} caratteri (testo nativo, no AI)`)
            updateStreamingText(`Analisi documento in corso: ${fileName}\nEstrazione completata (${pageCount} pagine, ${Math.round(stats.charCount / 1000)}k caratteri).\nDocumento nativo rilevato - elaborazione rapida.`)
            
            // Minima pausa per UI
            await new Promise(resolve => setTimeout(resolve, 50))
            
            return extractedText.trim()
          }
          
          // Per testi che necessitano pulizia, usa AI
          const model = getRecommendedTranscriptionModel(stats.charCount)
          console.log(`Trascrizione ${fileName}: ${pageCount} pagine, ${stats.charCount} caratteri, modello: ${model}`)
          updateStreamingText(`Analisi documento in corso: ${fileName}\nFormattazione del contenuto (${pageCount} pagine)...\nOttimizzazione della leggibilità in corso.`)
          
          const cleanedText = await transcribeWithFallback({
            text: extractedText,
            fileName,
            apiKey: OPENAI_API_KEY,
            onChunk: silentMode ? undefined : (chunk, fullText) => {
              updateStreamingText(fullText)
            },
          })
          
          return cleanedText
        } catch (error) {
          console.error(`Errore trascrizione frontend ${fileName}:`, error)
          
          // Se è un errore di formato Word non supportato (.doc vecchio), prova OCR
          if (isWord && error.message?.includes('non può essere elaborato direttamente')) {
            console.log(`File Word .doc non supportato per ${fileName}`)
            // Per file .doc vecchi che non possono essere letti, segnala errore chiaro
            throw new Error(`Il file Word "${fileName}" è in formato .doc obsoleto e non può essere elaborato. Salvalo come .docx e ricaricalo.`)
          }
          
          // Se è un PDF e l'errore è nell'estrazione testo, prova OCR con GPT-4o Vision
          if (isPdf) {
            console.log(`Fallback a OCR avanzato per ${fileName}`)
            updateStreamingText(`Analisi documento: ${fileName}\n\nMetodo alternativo di estrazione in corso...`)
            
            try {
              const { images } = await convertPDFToImages(file, {
                scale: 1.5,
                maxPages: 50,
                onProgress: (pageNum, total) => {
                  updateStreamingText(`Analisi documento: ${fileName}\n\nPreparazione pagina ${pageNum} di ${total}...`)
                },
              })
              
              const ocrText = await performOCRWithGemini({
                images,
                mimeType: 'image/jpeg',
                fileName,
                onChunk: silentMode ? undefined : (chunk, fullText) => {
                  updateStreamingText(fullText)
                },
              })
              
              return ocrText
            } catch (ocrError) {
              console.error(`Errore OCR fallback per ${fileName}:`, ocrError)
              throw new Error(`Impossibile elaborare "${fileName}": ${error.message}. Anche il tentativo OCR è fallito: ${ocrError.message}`)
            }
          }
          
          // Se tutto fallisce, rilancia l'errore originale con messaggio chiaro
          throw new Error(`Impossibile elaborare "${fileName}": ${error.message}`)
        }
      }

      // Trascrizione multipli file in parallelo (più veloce del sequenziale)
      // silentMode: se true, mostra solo messaggi di stato senza il testo della trascrizione
      const performTranscription = async (files, promptForWebhook, silentMode = false) => {
        // === BACKEND SERVER-SIDE PROCESSING ===
        // Se il backend è disponibile, usa elaborazione server-side (più veloce, funziona in background)
        if (useBackend && session?.user?.id) {
          const totalFiles = files.length
          updateStreamingText(`**Elaborazione in background**\n\nInvio ${totalFiles} file al server...\n\n*Puoi ridurre o chiudere questa finestra.*\n*L'elaborazione continuerà sul server.*`)
          
          try {
            const result = await uploadDocumentsToBackend(
              files,
              activeConversationId,
              session.user.id
            )
            
            setBackendProcessing({
              batchId: result.batchId,
              jobs: result.jobs,
              progress: 0,
              completed: 0,
              total: totalFiles
            })
            
            // Salva ref per recupero stato dopo cambio tab (persistito in localStorage)
            setActiveProcessing({
              loaderId,
              conversationId: currentConversationId,
              batchId: result.batchId,
              totalFiles
            })
            
            // Contatori per progresso
            let completedCount = 0
            let errorCount = 0
            const fileStatuses = new Map()
            result.jobs.forEach(j => fileStatuses.set(j.id, { name: j.fileName, status: 'queued', progress: 0 }))
            
            // Attendi completamento con POLLING (robusto per background)
            return new Promise((resolve, reject) => {
              let isResolved = false
              
              const cleanup = () => {
                clearInterval(pollInterval)
                clearTimeout(timeout)
              }
              
              const timeout = setTimeout(() => {
                if (!isResolved) {
                  cleanup()
                  reject(new Error('Timeout elaborazione server (5 minuti)'))
                }
              }, 5 * 60 * 1000)
              
              // POLLING: verifica stato ogni 3 secondi (funziona anche con tab in background)
              const pollInterval = setInterval(async () => {
                if (isResolved) return
                
                try {
                  const status = await checkBatchStatus(result.batchId)
                  
                  if (status.status === 'completed' || status.status === 'error') {
                    isResolved = true
                    cleanup()
                    setBackendProcessing(null)
                    setActiveProcessing(null)
                    
                    const successCount = status.jobs?.filter(j => j.status === 'completed').length || 0
                    const errorCount = status.jobs?.filter(j => j.status === 'error').length || 0
                    
                    if (successCount === 0) {
                      reject(new Error('Nessun documento elaborato con successo'))
                    } else {
                      const combinedText = status.jobs
                        ?.filter(j => j.status === 'completed' && j.result?.text)
                        .map((j, idx) => {
                          const separator = '─'.repeat(60)
                          return `DOCUMENTO ${idx + 1}: ${j.fileName}\n${'='.repeat(50)}\n\n${j.result.text}\n\n${separator}\n`
                        })
                        .join('\n') || ''
                      
                      const errorMsg = errorCount > 0 ? `\n${errorCount} file con errori` : ''
                      updateStreamingText(
                        `**Elaborazione completata**\n\n` +
                        `${successCount} di ${totalFiles} documenti elaborati con successo.${errorMsg}`
                      )
                      resolve(combinedText)
                    }
                  } else {
                    // Aggiorna progresso
                    const completed = status.jobs?.filter(j => j.status === 'completed').length || 0
                    const processing = status.jobs?.filter(j => j.status === 'processing') || []
                    const errors = status.jobs?.filter(j => j.status === 'error').length || 0
                    
                    const statusLines = processing
                      .map(j => `• ${j.fileName}`)
                      .slice(0, 4)
                    
                    updateStreamingText(
                      `**Elaborazione in background**\n\n` +
                      `Completati: ${completed}/${totalFiles}\n` +
                      `In corso: ${processing.length}\n` +
                      (errors > 0 ? `Errori: ${errors}\n` : '') +
                      `\n` +
                      (statusLines.length > 0 ? statusLines.join('\n') + '\n\n' : '') +
                      `*L'elaborazione continua anche se chiudi questa finestra.*`
                    )
                  }
                } catch (e) {
                  console.warn('Polling error:', e.message)
                }
              }, 3000) // Ogni 3 secondi
              
              // Anche WebSocket per aggiornamenti più veloci
              const unsubscribe = onBackendEvent('batch:complete', (data) => {
                if (data.batchId === result.batchId && !isResolved) {
                  isResolved = true
                  cleanup()
                  setBackendProcessing(null)
                  setActiveProcessing(null)
                  
                  if (data.successCount === 0) {
                    // Controlla se l'errore è relativo all'OCR mancante
                    const hasOcrError = data.results?.some(r => 
                      r.error?.includes('API key') || 
                      r.error?.includes('OCR') ||
                      r.error?.includes('Gemini') ||
                      r.error?.includes('OpenAI')
                    )
                    
                    if (hasOcrError) {
                      reject(new Error('Il documento sembra essere una scansione. Per elaborarlo è necessario configurare una chiave API per l\'OCR (Gemini o OpenAI). Controlla le impostazioni del sistema.'))
                    } else {
                      // Estrai il primo errore utile per il messaggio
                      const firstError = data.results?.find(r => r.error)?.error
                      const errorMessage = firstError 
                        ? `Nessun documento elaborato con successo. Errore: ${firstError}`
                        : 'Nessun documento elaborato con successo'
                      reject(new Error(errorMessage))
                    }
                  } else {
                    updateStreamingText(
                      `**Elaborazione completata**\n\n` +
                      `${data.successCount} di ${data.totalFiles} documenti elaborati con successo.`
                    )
                    resolve(data.combinedText)
                  }
                }
              })
            })
          } catch (error) {
            console.warn('Backend processing failed, falling back to client:', error)
            // Pulisci lo stato del backend processing
            setBackendProcessing(null)
            setActiveProcessing(null)
            
            // Se l'errore è grave (es. OCR non configurato), propagalo invece di fare fallback
            const errorMessage = error?.message || ''
            if (errorMessage.includes('API key') || 
                errorMessage.includes('OCR') || 
                errorMessage.includes('Nessun documento elaborato')) {
              throw error // Propaga l'errore invece di fare fallback silenzioso
            }
            // Altri errori: prova fallback a elaborazione client-side
          }
        }
        
        // === CLIENT-SIDE PROCESSING (fallback) ===
        // Se c'è un solo file, processa normalmente
        if (files.length === 1) {
          return performSingleTranscription(files[0], promptForWebhook, silentMode)
        }

        // Più file: processa in parallelo con limite di concorrenza
        const MAX_CONCURRENT = 8 // Aumentato per velocità
        const results = []
        
        // Processa in batch per limitare la concorrenza
        for (let i = 0; i < files.length; i += MAX_CONCURRENT) {
          const batch = files.slice(i, i + MAX_CONCURRENT)
          const batchEnd = Math.min(i + MAX_CONCURRENT, files.length)
          
          updateStreamingText(`Elaborazione documenti in corso\n\nAnalisi simultanea: documenti ${i + 1}-${batchEnd} di ${files.length}\n\nElaborazione parallela per massima velocità.`)
          
          const batchResults = await Promise.allSettled(
            batch.map(async (file, batchIndex) => {
              const globalIndex = i + batchIndex
              const fileName = file.name || `Documento ${globalIndex + 1}`
              
              try {
                const transcription = await performSingleTranscription(file, promptForWebhook, silentMode)
                return {
                  fileName,
                  transcription,
                  success: true,
                  index: globalIndex,
                }
              } catch (error) {
                console.error(`Errore trascrizione ${fileName}:`, error)
                return {
                  fileName,
                  transcription: `[Errore durante la trascrizione di ${fileName}: ${error.message}]`,
                  success: false,
                  index: globalIndex,
                }
              }
            })
          )
          
          // Estrai risultati dal Promise.allSettled
          batchResults.forEach((result) => {
            if (result.status === 'fulfilled') {
              results.push(result.value)
            } else {
              results.push({
                fileName: `Documento`,
                transcription: `[Errore: ${result.reason?.message || 'Errore sconosciuto'}]`,
                success: false,
              })
            }
          })
        }

        // Ordina risultati per indice originale
        results.sort((a, b) => (a.index ?? 0) - (b.index ?? 0))

        // Combina tutti i risultati in un unico testo
        const combinedTranscription = results
          .map((result, index) => {
            const header = `\n\n${'═'.repeat(60)}\nDOCUMENTO ${index + 1}: ${result.fileName}\n${'═'.repeat(60)}\n`
            return header + result.transcription
          })
          .join('\n')

        return combinedTranscription.trim()
      }

      const performAnalysis = async (transcription, userPrompt = '') => {
        if (!transcription || !transcription.trim()) {
          throw new Error('Trascrizione non disponibile. Esegui prima la trascrizione dei documenti.')
        }
        return await generateMedicalLegalAnalysis({
          apiKey: OPENAI_API_KEY,
          transcription,
          userPrompt,
        })
      }

      let targetBatch = null

      if (hasDraftFiles) {
        // Se non c'è un prompt, elabora in silenzio (solo messaggi di stato, non il testo)
        const silentMode = !processingPrompt
        const transcription = await performTranscription(filesToSend, processingPrompt, silentMode)
        const newBatch = createDocumentBatch({ files: filesToSend, transcriptionText: transcription })
        updatedDocumentBatches = [...updatedDocumentBatches, newBatch]
        updatedActiveBatchId = newBatch.id
        targetBatch = newBatch
        
        // Indicizza per RAG in background (non blocca)
        if (session?.user?.id && activeConversationId && transcription) {
          const documentsToIndex = filesToSend.map((file, i) => ({
            name: file.name,
            text: transcription // Per ora indicizza tutto insieme, in futuro separare per file
          }))
          indexMultipleDocuments({
            documents: documentsToIndex,
            userId: session.user.id,
            conversationId: activeConversationId,
            batchId: newBatch.id,
            apiKey: OPENAI_API_KEY,
            onProgress: (progress, message) => {
              console.log(`RAG indexing: ${progress}% - ${message}`)
            }
          }).then(result => {
            console.log('RAG indexing completed:', result)
          }).catch(err => {
            console.warn('RAG indexing failed (non-blocking):', err.message)
          })
        }
      } else if (updatedActiveBatchId) {
        targetBatch = updatedDocumentBatches.find((batch) => batch.id === updatedActiveBatchId) ?? null
      }

      if (!targetBatch && updatedDocumentBatches.length) {
        targetBatch = updatedDocumentBatches.slice(-1)[0]
        updatedActiveBatchId = targetBatch.id
      }

      if (!hasDraftFiles && !usingPendingAction && processingPrompt) {
        const referencedBatch =
          findBatchByTokens({ text: processingPrompt, batches: updatedDocumentBatches, excludeBatchId: targetBatch?.id }) ?? null
        if (referencedBatch) {
          updatedPendingAction = {
            id: createId(),
            batchId: referencedBatch.id,
            prompt: processingPrompt,
            mode:
              effectiveMode?.id === 'analisi-giuridica'
                ? 'analysis'
                : effectiveMode?.id === 'trascrizione'
                  ? 'transcription'
                  : 'chat',
          }
          const filesList = referencedBatch.files.map((file) => `• ${file.name}`).join('\n') || 'Nessun nome file disponibile.'
          const createdAtLabel = new Date(referencedBatch.createdAt).toLocaleString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
          const requestLine = processingPrompt
            ? `Richiesta individuata: "${processingPrompt}".`
            : 'Richiesta individuata: nessuna istruzione testuale specifica.'
          const actionLine = (() => {
            if (effectiveMode?.id === 'analisi-giuridica') {
              return 'Azione prevista: analisi giuridica.'
            }
            if (effectiveMode?.id === 'trascrizione') {
              return 'Azione prevista: trascrizione completa.'
            }
            return 'Azione prevista: risposta basata sui documenti indicati.'
          })()
          finalize({
            text: `Ho interpretato la tua richiesta come riferita ai documenti caricati il ${createdAtLabel} (set "${referencedBatch.label}") che comprende ${referencedBatch.files.length} file:\n${filesList}\n\n${requestLine}\n${actionLine}\n\nVuoi che proceda con questi documenti? Rispondi "sì" per continuare oppure "no" per scegliere un altro set.`,
          })
          setDraftText('')
          return
        }
      }

      const wantsTranscription = effectiveMode?.id === 'trascrizione'
      const wantsAnalysis = effectiveMode?.id === 'analisi-giuridica'
      const hasContext = Boolean(targetBatch)

      if (!hasContext && processingPrompt) {
        const previousMessages = messages.filter((msg) => msg.id !== loaderId && msg.id !== userMessage.id)
        const conversationHistory = convertMessagesToOpenAIFormat(previousMessages)
        
        let legalContext = ''
        try {
          const legalResult = await searchLegislationForContext(processingPrompt)
          if (legalResult?.text) legalContext = '\n\n' + legalResult.text
        } catch (e) { /* non bloccante */ }
        
        const answer = await generateChatCompletionStreaming({
          apiKey: OPENAI_API_KEY,
          question: processingPrompt,
          transcription: legalContext,
          conversationHistory,
          onChunk: (chunk, fullText) => updateStreamingText(fullText),
        })
        finalize({ text: answer, wasStreamed: true })
        setDraftText('')
        return
      }

      if (!hasContext) {
        finalize({ text: 'Allega prima dei documenti PDF così posso aiutarti con una trascrizione o un’analisi.' })
        setDraftText('')
        return
      }

      const findBatchIndex = (batchId) => updatedDocumentBatches.findIndex((batch) => batch.id === batchId)
      const refreshTargetBatch = () =>
        updatedDocumentBatches.find((batch) => batch.id === (targetBatch?.id ?? updatedActiveBatchId)) ?? targetBatch

      if (!wantsTranscription && !targetBatch.transcriptionText && targetBatch.originalFiles?.length) {
        const transcription = await performTranscription(targetBatch.originalFiles, processingPrompt)
        const idx = findBatchIndex(targetBatch.id)
        if (idx !== -1) {
          updatedDocumentBatches[idx] = {
            ...updatedDocumentBatches[idx],
            transcriptionText: transcription,
          }
          targetBatch = refreshTargetBatch()
        }
      }

      if (hasDraftFiles && !wantsTranscription && !processingPrompt) {
        // Documenti già trascritti automaticamente, mostra conferma professionale
        const fileCount = filesToSend.length
        finalize({
          text: `Elaborazione completata.\n\n${fileCount === 1 ? 'Il documento è stato analizzato' : `I ${fileCount} documenti sono stati analizzati`} e il contenuto testuale è stato estratto con successo.\n\nSono a disposizione per qualsiasi richiesta: analisi giuridica, estrazione dati strutturati, timeline degli eventi, valutazione dei profili di responsabilità, o qualsiasi domanda specifica sul contenuto.`,
        })
        setDraftText('')
        return
      }

      if (wantsTranscription) {
        // Reset della selezione documento
        setSelectedDocumentForTranscription(null)
        
        // Controlla se è stato selezionato un documento specifico
        const selectedFileIndex = queuedWorkflow?.selectedFileIndex
        
        // Se la trascrizione è già disponibile
        if (targetBatch.transcriptionText) {
          updateStreamingText('Recupero trascrizione in corso...')
          
          let documentText = targetBatch.transcriptionText
          
          // Se è richiesto un file specifico, estrai solo quella sezione
          if (selectedFileIndex !== undefined && selectedFileIndex >= 0) {
            const files = targetBatch.files || targetBatch.originalFiles || []
            const selectedFile = files[selectedFileIndex]
            
            if (selectedFile) {
              const fileName = selectedFile.name
              // Cerca la sezione del file nella trascrizione combinata
              // Pattern: DOCUMENTO X: filename\n===...\n\n[contenuto]\n\n───...
              const docPattern = new RegExp(
                `DOCUMENTO\\s+\\d+:\\s*${fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(?=DOCUMENTO\\s+\\d+:|$)`,
                'i'
              )
              const match = targetBatch.transcriptionText.match(docPattern)
              
              if (match) {
                // Estrai solo il contenuto (rimuovi header e separatori)
                documentText = match[0]
                  .replace(/^DOCUMENTO\s+\d+:\s*[^\n]+\n=+\n+/i, '')
                  .replace(/\n*─+\n*$/, '')
                  .trim()
              } else {
                // Se non trova il pattern, cerca per nome file semplice
                const simplePattern = new RegExp(
                  `${fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(?=\\n{2,}[A-Z]|$)`,
                  'i'
                )
                const simpleMatch = targetBatch.transcriptionText.match(simplePattern)
                documentText = simpleMatch ? simpleMatch[0].trim() : targetBatch.transcriptionText
              }
              
              // Aggiungi header per chiarezza
              documentText = `Trascrizione: ${fileName}\n${'─'.repeat(50)}\n\n${documentText}`
            }
          }
          
          const assistantResponse = {
            text: documentText,
            messagesToPersist: [{ role: 'assistant', text: documentText, metadata: {} }],
          }
          finalize(assistantResponse)
          setDraftText('')
          return
        }

        // Trascrizione non disponibile - elabora i file (solo se abbiamo i file originali)
        let documentText = ''
        
        if (targetBatch.originalFiles?.length) {
          const filesToTranscribe = selectedFileIndex !== undefined && selectedFileIndex >= 0
            ? [targetBatch.originalFiles[selectedFileIndex]]
            : targetBatch.originalFiles
          
          const transcription = await performTranscription(filesToTranscribe, processingPrompt)
          
          // Salva la trascrizione solo se è di tutti i documenti
          if (selectedFileIndex === undefined || selectedFileIndex < 0) {
            const idx = findBatchIndex(targetBatch.id)
            if (idx !== -1) {
              updatedDocumentBatches[idx] = {
                ...updatedDocumentBatches[idx],
                transcriptionText: transcription,
              }
              targetBatch = refreshTargetBatch()
            }
          }
          documentText = transcription
        } else {
          documentText = 'Trascrizione non disponibile. I file originali non sono più accessibili.'
        }

        const assistantResponse = {
          text: documentText,
          messagesToPersist: [{ role: 'assistant', text: documentText, metadata: {} }],
        }
        finalize(assistantResponse)
        setDraftText('')
        return
      }

      if (wantsAnalysis) {
        if (!targetBatch.originalFiles?.length) {
          finalize({ text: 'Non ho più a disposizione i file originali di quel set. Per favore ricaricali per poter eseguire l’analisi.' })
          setDraftText('')
          return
        }
        const analysisText =
          targetBatch.analysisText ||
          (await performAnalysis(
            await (async () => {
              let transcription = targetBatch.transcriptionText || ''
              if (!transcription && targetBatch.originalFiles?.length) {
                transcription = await performTranscription(targetBatch.originalFiles, processingPrompt)
                const idx = findBatchIndex(targetBatch.id)
                if (idx !== -1) {
                  updatedDocumentBatches[idx] = { ...updatedDocumentBatches[idx], transcriptionText: transcription }
                  targetBatch = refreshTargetBatch()
                }
              }
              if (!transcription) throw new Error('Trascrizione non disponibile')
              return transcription
            })(),
            processingPrompt || 'Genera un’analisi giuridica dettagliata dei documenti forniti.',
          ))
        const idx = findBatchIndex(targetBatch.id)
        if (idx !== -1) {
          updatedDocumentBatches[idx] = {
            ...updatedDocumentBatches[idx],
            analysisText,
          }
          targetBatch = refreshTargetBatch()
        }
        const assistantResponse = {
          text: analysisText || 'Analisi non disponibile.',
          messagesToPersist: [{ role: 'assistant', text: analysisText || 'Analisi non disponibile.', metadata: {} }],
        }
        finalize(assistantResponse)
        setDraftText('')
        return
      }

      // Gestione di tutte le azioni specializzate (tranne trascrizione e analisi-giuridica già gestite)
      const specializedActions = [
        'analisi-giuridica',
        'estrazione-dati',
        'timeline-eventi',
        'analisi-coerenza',
        'nesso-causale',
        'completezza-documentale',
        'responsabilita-professionale',
        'diritto-civile',
        'diritto-penale',
        'contrattualistica',
        'malpractice',
        'report-strutturato',
        'confronto-documenti',
        'elementi-critici',
        'analisi-contrattuale',
      ]

      if (effectiveMode?.id && specializedActions.includes(effectiveMode.id)) {
        // Assicurati che ci sia una trascrizione disponibile
        let transcriptionText = targetBatch.transcriptionText || ''
        
        if (!transcriptionText && targetBatch.originalFiles?.length) {
          transcriptionText = await performTranscription(targetBatch.originalFiles, processingPrompt)
          const idx = findBatchIndex(targetBatch.id)
          if (idx !== -1) {
            updatedDocumentBatches[idx] = {
              ...updatedDocumentBatches[idx],
              transcriptionText,
            }
            targetBatch = refreshTargetBatch()
          }
        }
        
        if (!transcriptionText) {
          finalize({ text: 'Trascrizione non disponibile. Esegui prima la trascrizione dei documenti.' })
          setDraftText('')
          return
        }
        
        try {
          // Cerca template per questa categoria usando ricerca vettoriale se possibile
          const categoryName = effectiveMode.label || effectiveMode.id
          const { templates, customPrompt } = await getTemplatesForGeneration(categoryName, {
            caseData: transcriptionText,
            apiKey: OPENAI_API_KEY,
            limit: 5,
            useVectorSearch: true,
          })
          
          // Se ci sono template, usa la generazione con stile, altrimenti usa l'analisi normale
          if (templates && templates.length > 0) {
            // Usa streaming per far apparire il testo gradualmente
            const generatedResult = await generateDocumentWithStyleStreaming({
              apiKey: OPENAI_API_KEY,
              templates,
              caseData: transcriptionText,
              documentType: categoryName,
              additionalInstructions: processingPrompt || '',
              customPrompt: customPrompt || '', // Usa il prompt personalizzato della categoria
              onChunk: (chunk, fullText) => updateStreamingText(fullText),
            })
            
            // === FASE DI REVISIONE ===
            // Aggiorna UI per indicare revisione in corso
            updateStreamingText(generatedResult + '\n\n⏳ _Revisione stile in corso..._')
            
            // Revisiona il documento confrontandolo con i template
            const result = await reviewDocument({
              generatedDocument: generatedResult,
              templates,
            })
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/dc883744-306a-4dd9-9042-7007785805be',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.jsx:result-received-1',message:'Document generation COMPLETED',data:{resultWordCount:result?.split(/\s+/).filter(w=>w).length,resultCharCount:result?.length,templateCount:templates?.length,hasCustomPrompt:!!customPrompt,wasRevised:result!==generatedResult},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'I'})}).catch(()=>{});
            // #endregion
            
            const assistantResponse = {
              text: result,
              messagesToPersist: [{ role: 'assistant', text: result, metadata: { 
                actionType: effectiveMode.id,
                categoryId: queuedWorkflow?.categoryId || null,
                categoryName,
              } }],
              wasStreamed: true,
            }
            finalize(assistantResponse)
            
            // Salva versione in background
            if (session?.user?.id && activeConversationId && result) {
              saveAnalysisVersion({
                userId: session.user.id,
                conversationId: activeConversationId,
                actionType: effectiveMode.id,
                title: categoryName,
                content: result,
                documentsUsed: targetBatch?.originalFiles?.map(f => f.name) || [],
                promptUsed: processingPrompt
              }).catch(err => console.warn('Errore salvataggio versione:', err.message))
            }
          } else {
            // Nessun template trovato, usa l'analisi normale con streaming
            const result = await generateSpecializedAnalysisStreaming({
              apiKey: OPENAI_API_KEY,
              transcription: transcriptionText,
              actionId: effectiveMode.id,
              userPrompt: processingPrompt || '',
              onChunk: (chunk, fullText) => updateStreamingText(fullText),
            })
            
            const assistantResponse = {
              text: result,
              messagesToPersist: [{ role: 'assistant', text: result, metadata: { actionType: effectiveMode.id } }],
              wasStreamed: true,
            }
            finalize(assistantResponse)
            
            // Salva versione in background
            if (session?.user?.id && activeConversationId && result) {
              saveAnalysisVersion({
                userId: session.user.id,
                conversationId: activeConversationId,
                actionType: effectiveMode.id,
                title: getActionTypeLabel(effectiveMode.id),
                content: result,
                documentsUsed: targetBatch?.originalFiles?.map(f => f.name) || [],
                promptUsed: processingPrompt
              }).catch(err => console.warn('Errore salvataggio versione:', err.message))
            }
          }
          
          setDraftText('')
          return
        } catch (error) {
          console.error('Errore durante l\'elaborazione:', error)
          finalize({ text: formatUserFriendlyError(error) })
          setDraftText('')
          return
        }
      }

      // Gestione della generazione di documenti con stile (per categorie personalizzate o generazione esplicita)
      if (effectiveMode?.id === 'genera-documento-stile' || queuedWorkflow?.modeId === 'genera-documento-stile') {
        // Assicurati che ci sia una trascrizione disponibile
        let transcriptionText = targetBatch.transcriptionText || ''
        
        if (!transcriptionText && targetBatch.originalFiles?.length) {
          transcriptionText = await performTranscription(targetBatch.originalFiles, processingPrompt)
          const idx = findBatchIndex(targetBatch.id)
          if (idx !== -1) {
            updatedDocumentBatches[idx] = {
              ...updatedDocumentBatches[idx],
              transcriptionText,
            }
            targetBatch = refreshTargetBatch()
          }
        }
        
        if (!transcriptionText) {
          finalize({ text: 'Trascrizione non disponibile. Carica prima i documenti del caso.' })
          setDraftText('')
          return
        }
        
        try {
          // Determina il tipo di documento dalla categoria o dalla richiesta dell'utente
          const documentType = queuedWorkflow?.categoryName || processingPrompt || 'Parere Legale'
          
          // Usa categoryId se disponibile (per ricerca vettoriale), altrimenti usa il nome
          const categoryIdentifier = queuedWorkflow?.categoryId || documentType
          
          // Recupera i template per questo tipo di documento usando ricerca vettoriale
          const { templates, customPrompt } = await getTemplatesForGeneration(categoryIdentifier, {
            caseData: transcriptionText,
            apiKey: OPENAI_API_KEY,
            limit: 5,
            useVectorSearch: true,
          })
          
          if (!templates || templates.length === 0) {
            finalize({ 
              text: `Non hai ancora caricato documenti template per "${documentType}". Vai nella sezione "Documenti Template" per caricare esempi del tuo stile di scrittura.`,
            })
            setDraftText('')
            return
          }
          
          // Usa streaming per far apparire il testo gradualmente
          const generatedResult = await generateDocumentWithStyleStreaming({
            apiKey: OPENAI_API_KEY,
            templates,
            caseData: transcriptionText,
            documentType,
            additionalInstructions: processingPrompt || '',
            customPrompt: customPrompt || '', // Usa il prompt personalizzato della categoria
            onChunk: (chunk, fullText) => updateStreamingText(fullText),
          })
          
          // === FASE DI REVISIONE ===
          // Aggiorna UI per indicare revisione in corso
          updateStreamingText(generatedResult + '\n\n⏳ _Revisione stile in corso..._')
          
          // Revisiona il documento confrontandolo con i template
          const result = await reviewDocument({
            generatedDocument: generatedResult,
            templates,
          })
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/dc883744-306a-4dd9-9042-7007785805be',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.jsx:result-received-2',message:'Document generation COMPLETED (path2)',data:{resultWordCount:result?.split(/\s+/).filter(w=>w).length,resultCharCount:result?.length,templateCount:templates?.length,hasCustomPrompt:!!customPrompt,wasRevised:result!==generatedResult},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'I'})}).catch(()=>{});
          // #endregion
          
          const assistantResponse = {
            text: result,
            messagesToPersist: [{ role: 'assistant', text: result, metadata: { 
              categoryId: queuedWorkflow?.categoryId || null, // Per recuperare stili di formattazione nell'export
              categoryName: documentType 
            } }],
            wasStreamed: true,
          }
          finalize(assistantResponse)
          setDraftText('')
          return
        } catch (error) {
          console.error('Errore durante la generazione del documento:', error)
          finalize({ text: formatUserFriendlyError(error) })
          setDraftText('')
          return
        }
      }

      const contextForAnswer = targetBatch.analysisText || targetBatch.transcriptionText || ''
      if (!contextForAnswer && !processingPrompt) {
        // Nessun contesto e nessun prompt - rimuovi il loader silenziosamente
        setConversations((prev) =>
          prev.map((conversation) =>
            conversation.id === currentConversationId
              ? {
                  ...conversation,
                  messages: conversation.messages.filter((msg) => msg.id !== loaderId),
                }
              : conversation,
          ),
        )
        setDraftText('')
        setIsSending(false)
        return
      }

      // Prendi tutti i messaggi precedenti (escludendo il loader e il nuovo messaggio user appena aggiunto)
      const previousMessages = messages.filter((msg) => msg.id !== loaderId && msg.id !== userMessage.id)
      const conversationHistory = convertMessagesToOpenAIFormat(previousMessages)

      // Usa streaming per far apparire il testo gradualmente
      let answer
      let usedStreaming = false
      if (processingPrompt) {
        // Prova a usare RAG se disponibile (ricerca semantica nei chunks)
        let useRAG = false
        let ragContext = ''
        
        if (session?.user?.id && activeConversationId) {
          try {
            const hasChunks = await hasIndexedChunks(activeConversationId, session.user.id)
            if (hasChunks) {
              const ragResult = await buildRAGContext({
                query: processingPrompt,
                userId: session.user.id,
                conversationId: activeConversationId,
                apiKey: OPENAI_API_KEY,
                maxTokens: 12000
              })
              if (ragResult.context && ragResult.chunksCount > 0) {
                ragContext = ragResult.context
                useRAG = true
                console.log(`RAG: usando ${ragResult.chunksCount} chunks da ${ragResult.documentsUsed.length} documenti`)
              }
            }
          } catch (ragError) {
            console.warn('RAG fallback to full context:', ragError.message)
          }
        }
        
        let legalExtra = ''
        try {
          const legalResult = await searchLegislationForContext(processingPrompt)
          if (legalResult?.text) legalExtra = '\n\n' + legalResult.text
        } catch (e) { /* non bloccante */ }
        
        if (useRAG && ragContext) {
          answer = await generateChatWithRAG({
            apiKey: OPENAI_API_KEY,
            question: processingPrompt,
            ragContext: ragContext + legalExtra,
            conversationHistory,
            onChunk: (chunk, fullText) => updateStreamingText(fullText),
          })
        } else {
          answer = await generateChatCompletionStreaming({
            apiKey: OPENAI_API_KEY,
            question: processingPrompt,
            transcription: contextForAnswer + legalExtra,
            conversationHistory,
            onChunk: (chunk, fullText) => updateStreamingText(fullText),
          })
        }
        usedStreaming = true
      } else {
        // Nessun prompt specifico - rimuovi il loader senza aggiungere messaggi ridondanti
        setConversations((prev) =>
          prev.map((conversation) =>
            conversation.id === currentConversationId
              ? {
                  ...conversation,
                  messages: conversation.messages.filter((msg) => msg.id !== loaderId),
                }
              : conversation,
          ),
        )
        setDraftText('')
        setIsSending(false)
        return
      }

      const assistantResponse = {
        text: answer,
        messagesToPersist: [
          {
            role: 'assistant',
            text: answer,
            metadata: {},
          },
        ],
        wasStreamed: usedStreaming,
      }
      finalize(assistantResponse)
      setDraftText('')
    } catch (error) {
      console.error('Errore durante l’invio:', error)
      // Se questa generazione è stata cancellata, non mostrare errori
      if (currentGenerationRef.current !== generationId) {
        console.log('Errore ignorato: generazione cancellata', error.message)
        return
      }
      const errorDescription = formatUserFriendlyError(error)
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === currentConversationId
            ? {
                ...conversation,
                messages: conversation.messages.map((message) =>
                  message.id === loaderId
                    ? {
                        id: createId(),
                        role: 'assistant',
                        error: errorDescription,
                      }
                    : message,
                ),
                context: {
                  hasDocuments: updatedDocumentBatches.length > 0,
                  documentBatches: updatedDocumentBatches,
                  activeBatchId: updatedActiveBatchId,
                  pendingAction: updatedPendingAction,
                },
              }
            : conversation,
        ),
      )
      setErrorMessage(errorDescription)
      setDraftText('') // Pulisci il draft anche in caso di errore
    } finally {
      console.log('%c[MSG-FLOW] handleSubmit FINALLY', 'color: #607d8b; font-weight: bold', {
        generationId: generationId.slice(0, 8),
        isCancelled: currentGenerationRef.current !== generationId,
      })
      setIsSending(false)
    }
  }, [
    activeConversation,
    activeBatchId,
    appendMessages,
    callWebhook,
    convertMessagesToOpenAIFormat,
    documentBatches,
    draftFiles,
    draftText,
    formatAssistantResponse,
    isSending,
    messages,
    pendingAction,
    updateRemoteConversationContext,
    updateRemoteConversationTitle,
  ])

  const handleWorkflowTrigger = useCallback(
    async (modeId) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/dc883744-306a-4dd9-9042-7007785805be',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.jsx:handleWorkflowTrigger',message:'Workflow triggered',data:{modeId,isSending,hasActiveConv:!!activeConversation?.id},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      if (isSending) return
      if (!activeConversation?.id) {
        setErrorMessage('Seleziona o crea una chat prima di avviare un workflow.')
        return
      }

      // Gestione categorie personalizzate
      if (modeId.startsWith('categoria-')) {
        const categoryId = modeId.replace('categoria-', '')
        try {
          const categories = await fetchCategories()
          const category = categories.find(c => c.id === categoryId)
          if (category) {
            // Salva sia categoryId che categoryName per usare la ricerca vettoriale
            setQueuedWorkflow({ 
              id: `categoria-${categoryId}-${Date.now()}`, 
              prompt: `Genera documento "${category.name}"`, 
              modeId: 'genera-documento-stile',
              categoryId: categoryId, // ID per ricerca vettoriale
              categoryName: category.name // Nome per display
            })
            setDraftText(`Genera documento "${category.name}"`)
            return
          }
        } catch (error) {
          console.error('Errore recupero categoria:', error)
          setErrorMessage('Errore nel recupero della categoria.')
          return
        }
      }

      // Se è trascrizione, controlla se ci sono più documenti
      if (modeId === 'trascrizione') {
        // Trova il batch attivo e i suoi file
        const currentBatch = documentBatches.find(b => b.id === activeBatchId) || documentBatches.slice(-1)[0]
        const files = currentBatch?.originalFiles || []
        
        // Se ci sono più file, mostra il selettore documenti
        if (files.length > 1) {
          setPendingTranscriptionFiles(files)
          setIsDocumentSelectorOpen(true)
          return
        }
        
        // Altrimenti, trascrivi direttamente
        setDraftText('Trascrivi i documenti caricati')
        setQueuedWorkflow({ id: `${modeId}-${Date.now()}`, prompt: 'Trascrivi i documenti caricati', modeId })
        return
      }

      // Per tutte le altre azioni, usa lo stesso pattern delle altre azioni
      // Imposta un prompt specifico basato sul mode per evitare doppie chiamate
      const modeOption = MODE_OPTIONS.find((option) => option.id === modeId)
      const actionPrompt = modeOption?.label ? `Esegui: ${modeOption.label}` : 'Elabora documenti'
      setDraftText(actionPrompt)
      setQueuedWorkflow({ id: `${modeId}-${Date.now()}`, prompt: actionPrompt, modeId })
      // L'useEffect chiamerà handleSubmit quando draftText === prompt
    },
    [activeConversation?.id, isSending],
  )

  // Cancella/resetta l'elaborazione in corso
  const handleCancelSending = useCallback(() => {
    console.log('%c[MSG-FLOW] handleCancelSending CALLED', 'color: #ff9800; font-weight: bold', {
      currentGeneration: currentGenerationRef.current?.slice(0, 8),
      activeConvId: activeConversation?.id?.slice(0, 8),
    })
    
    // Invalida la generazione corrente così finalize/updateStreamingText verranno ignorati
    currentGenerationRef.current = null
    
    setIsSending(false)
    setBackendProcessing(null)
    setActiveProcessing(null)
    setQueuedWorkflow(null) // Importante: resetta anche il workflow in coda
    setDraftText('') // Pulisci il draft per evitare reinvii accidentali
    setDraftFiles([]) // Pulisci anche i file in coda
    setErrorMessage('Elaborazione annullata.')
    
    // Rimuovi i messaggi loader e streaming dalla conversazione attiva
    setConversations((prev) =>
      prev.map((conversation) => {
        if (conversation.id !== activeConversation?.id) return conversation
        return {
          ...conversation,
          messages: conversation.messages.filter(
            (msg) => !msg.isLoading && !msg.isStreaming
          ),
        }
      })
    )
    
    // Pulisci anche localStorage
    try {
      localStorage.removeItem('legistra_active_processing')
    } catch (e) {
      console.warn('Errore pulizia localStorage:', e)
    }
  }, [activeConversation?.id])

  // Gestisce la selezione di un documento specifico per la trascrizione
  const handleDocumentSelect = useCallback(
    (selectedDoc, index) => {
      setIsDocumentSelectorOpen(false)
      
      if (selectedDoc === null) {
        // L'utente ha scelto "Trascrivi tutti"
        setSelectedDocumentForTranscription(null)
        setDraftText('Trascrivi tutti i documenti')
        setQueuedWorkflow({ 
          id: `trascrizione-${Date.now()}`, 
          prompt: 'Trascrivi tutti i documenti', 
          modeId: 'trascrizione',
          transcribeAll: true
        })
      } else {
        // L'utente ha scelto un documento specifico
        setSelectedDocumentForTranscription({ file: selectedDoc, index })
        setDraftText(`Trascrivi "${selectedDoc.name}"`)
        setQueuedWorkflow({ 
          id: `trascrizione-${Date.now()}`, 
          prompt: `Trascrivi "${selectedDoc.name}"`, 
          modeId: 'trascrizione',
          selectedFileIndex: index,
          selectedFileName: selectedDoc.name
        })
      }
    },
    []
  )

  const handleActionSelect = useCallback(
    (actionId) => {
      handleWorkflowTrigger(actionId)
    },
    [handleWorkflowTrigger],
  )

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/dc883744-306a-4dd9-9042-7007785805be',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.jsx:queuedWorkflow-effect',message:'queuedWorkflow useEffect check',data:{hasQueuedWorkflow:!!queuedWorkflow,draftText:draftText?.substring(0,50),prompt:queuedWorkflow?.prompt?.substring(0,50),isSending},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (!queuedWorkflow) return
    if (draftText !== queuedWorkflow.prompt) return
    if (isSending) {
      console.log('%c[MSG-FLOW] queuedWorkflow BLOCKED (isSending)', 'color: #ff9800')
      return
    }

    console.log('%c[MSG-FLOW] queuedWorkflow triggering handleSubmit', 'color: #e91e63; font-weight: bold', {
      workflowId: queuedWorkflow?.id,
      modeId: queuedWorkflow?.modeId,
    })
    
    // Resetta il workflow PRIMA di chiamare handleSubmit per evitare ri-trigger
    const workflow = queuedWorkflow
    setQueuedWorkflow(null)
    
    // Usa setTimeout(0) per uscire dal ciclo di rendering React e evitare race condition
    setTimeout(() => handleSubmit(), 0)
  }, [draftText, handleSubmit, queuedWorkflow, isSending])

  const handleSelectConversation = useCallback((conversationId) => {
    // NON resettare lo stato di elaborazione quando cambi conversazione
    // L'elaborazione continua in background e il messaggio rimane nella conversazione originale
    // Se l'utente torna su quella conversazione, vedrà lo stato aggiornato
    
    setActiveConversationId(conversationId)
    setDraftText('')
    setDraftFiles([])
    setErrorMessage(null)
  }, [])

  const handleNewConversation = useCallback(async () => {
    // NON resettare lo stato di elaborazione quando crei nuova conversazione
    // L'elaborazione continua in background nella conversazione originale
    
    // Verifica che l'utente sia autenticato
    if (!session?.user?.id) {
      setErrorMessage('Devi essere autenticato per creare una conversazione.')
      console.error('Tentativo di creare conversazione senza sessione valida')
      return
    }

    // Controlla limite conversazioni
    if (conversations.length >= MAX_CONVERSATIONS) {
      setErrorMessage(
        `Limite conversazioni raggiunto: Hai raggiunto il limite massimo di ${MAX_CONVERSATIONS} conversazioni. Elimina alcune conversazioni vecchie per crearne di nuove. Le conversazioni vengono eliminate automaticamente dopo 7 giorni di inattività.`
      )
      return
    }

    // Avviso quando si avvicina al limite
    if (conversations.length >= WARNING_CONVERSATIONS_THRESHOLD) {
      const remaining = MAX_CONVERSATIONS - conversations.length
      setErrorMessage(
        `Attenzione: Hai ${conversations.length} conversazioni su ${MAX_CONVERSATIONS} consentite. Ti rimangono ${remaining} conversazioni disponibili.`
      )
      // Continua comunque, ma mostra l'avviso
    }

    const timestamp = new Date()
    const title = `Nuova chat ${timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    
    // Resetta i draft prima di creare la nuova conversazione
    setDraftText('')
    setDraftFiles([])
    setErrorMessage(null)
    
    try {
      const remote = await createRemoteConversation(title)
      const timestamp = new Date().toISOString()
      const withTimestamps = { ...remote, updatedAt: timestamp }
      setConversations((prev) => [withTimestamps, ...prev])
      setActiveConversationId(remote.id)
      // Resetta errore se la creazione è riuscita
      if (conversations.length < MAX_CONVERSATIONS) {
        setErrorMessage(null)
      }
    } catch (error) {
      console.error('Errore durante la creazione della conversazione:', error)
      setErrorMessage(
        error?.message || 'Errore durante la creazione della conversazione. Riprova più tardi.'
      )
    }
  }, [session, createRemoteConversation, conversations.length, MAX_CONVERSATIONS, WARNING_CONVERSATIONS_THRESHOLD, isSending])

  const handleDeleteConversation = useCallback(
    async (conversationId) => {
      try {
        await deleteRemoteConversation(conversationId)
        setConversations((prev) => {
          const remaining = prev.filter((conversation) => conversation.id !== conversationId)
          if (remaining.length) {
            const sorted = [...remaining].sort((a, b) => {
              const timeA = new Date(a.updatedAt ?? a.messages?.slice(-1)[0]?.timestamp ?? a.createdAt).getTime()
              const timeB = new Date(b.updatedAt ?? b.messages?.slice(-1)[0]?.timestamp ?? b.createdAt).getTime()
              return timeB - timeA
            })
            if (conversationId === activeConversationId) {
              setActiveConversationId(sorted[0].id)
            }
            return sorted
          }
          return prev
        })

        if (conversationId === activeConversationId) {
          const next = conversations.find((conversation) => conversation.id !== conversationId)
          if (next) {
            setActiveConversationId(next.id)
          } else {
            const remote = await createRemoteConversation('Chat corrente')
            setConversations([remote])
            setActiveConversationId(remote.id)
          }
        }
      } catch (error) {
        console.error('Errore durante l’eliminazione della conversazione:', error)
      }
    },
    [activeConversationId, conversations, createRemoteConversation, deleteRemoteConversation],
  )

  const handleRenameConversation = useCallback(
    async (conversationId, nextTitle) => {
      const trimmed = nextTitle.trim()
      if (!trimmed) {
        return
      }

      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                title: trimmed,
              }
            : conversation,
        ),
      )

      if (conversationId === activeConversationId) {
        setActiveConversationId(conversationId)
      }

      try {
        await updateRemoteConversationTitle(conversationId, trimmed)
      } catch (error) {
        console.error('Errore durante la rinomina della conversazione:', error)
      }
    },
    [activeConversationId, updateRemoteConversationTitle],
  )

  const handleEditMessage = useCallback(
    async (conversationId, messageId, newText) => {
      const trimmed = newText.trim()
      if (!trimmed || isSending) {
        return
      }

      // Trova la conversazione e il messaggio
      const conversation = conversations.find((c) => c.id === conversationId)
      if (!conversation) return

      const messageIndex = conversation.messages.findIndex((m) => m.id === messageId)
      if (messageIndex === -1) return

      // Se il testo è uguale, non fare nulla
      if (conversation.messages[messageIndex].text === trimmed) return

      const loaderId = `loader-${createId()}`

      // Messaggi da mantenere (tutti quelli PRIMA del messaggio modificato)
      const messagesToKeep = conversation.messages.slice(0, messageIndex)
      
      // Messaggi da eliminare dal DB (il messaggio modificato E tutti quelli successivi)
      const messageIdsToDelete = conversation.messages
        .slice(messageIndex)
        .map((m) => m.id)
        .filter((id) => id && !id.startsWith('loader-'))

      // Nuovo messaggio utente con testo modificato
      const newUserMessage = {
        id: createId(),
        role: 'user',
        text: trimmed,
        files: conversation.messages[messageIndex].files || [],
        timestamp: new Date().toISOString(),
      }

      // Aggiorna lo stato locale
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id !== conversationId) {
            return conv
          }

          return {
            ...conv,
            messages: [
              ...messagesToKeep,
              newUserMessage,
              {
                id: loaderId,
                role: 'assistant',
                isLoading: true,
                text: 'Elaborazione in corso...',
              },
            ],
            updatedAt: new Date().toISOString(),
          }
        }),
      )

      setIsSending(true)
      setErrorMessage(null)

      try {
        // Elimina il messaggio modificato e tutti i successivi dal database
        if (messageIdsToDelete.length > 0) {
          await deleteRemoteMessages(messageIdsToDelete)
        }

        // Prepara il contesto per la risposta AI
        const previousMessages = messagesToKeep
          .filter((m) => !m.isLoading && !m.id?.startsWith('loader-'))

        const conversationHistory = convertMessagesToOpenAIFormat(previousMessages)

        // Trova il contesto dei documenti se presente
        const targetBatch = conversation.context?.documentBatches?.find(
          (b) => b.id === conversation.context?.activeBatchId
        ) || conversation.context?.documentBatches?.slice(-1)[0]

        const contextForAnswer = targetBatch?.analysisText || targetBatch?.transcriptionText || ''

        // Assegna generationId anche al flusso di modifica per protezione da cancellazione
        const editGenerationId = createId()
        currentGenerationRef.current = editGenerationId
        
        // Funzione per aggiornare il testo in streaming
        const updateStreamingText = (fullText) => {
          if (currentGenerationRef.current !== editGenerationId) return
          setConversations((prev) =>
            prev.map((conv) => {
              if (conv.id !== conversationId) {
                return conv
              }
              return {
                ...conv,
                messages: conv.messages.map((message) =>
                  message.id === loaderId
                    ? { ...message, text: fullText, isLoading: false, isStreaming: true }
                    : message
                ),
              }
            })
          )
        }

        // Genera la nuova risposta con streaming
        const answer = await generateChatCompletionStreaming({
          apiKey: OPENAI_API_KEY,
          question: trimmed,
          transcription: contextForAnswer,
          conversationHistory,
          onChunk: (chunk, fullText) => updateStreamingText(fullText),
        })

        // Se la generazione è stata cancellata nel frattempo, non finalizzare
        if (currentGenerationRef.current !== editGenerationId) return

        // Finalizza la risposta
        const assistantMessage = {
          id: createId(),
          role: 'assistant',
          text: answer,
          timestamp: new Date().toISOString(),
          animateTyping: false,
          wasStreamed: true,
        }

        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id !== conversationId) {
              return conv
            }

            const finalMessages = conv.messages.map((message) =>
              message.id === loaderId ? assistantMessage : message
            )

            return {
              ...conv,
              messages: finalMessages,
              updatedAt: assistantMessage.timestamp,
            }
          }),
        )

        // Salva i NUOVI messaggi nel database (sia utente che assistente)
        await appendMessages({
          conversationId,
          messages: [
            { role: 'user', text: trimmed, metadata: { files: newUserMessage.files } },
            { role: 'assistant', text: answer, metadata: {} },
          ],
        })

        // Aggiorna context.messages per sincronizzazione
        const finalMessages = [
          ...messagesToKeep,
          newUserMessage,
          assistantMessage,
        ]
        await updateRemoteConversationContext(conversationId, conversation.context, finalMessages)

      } catch (error) {
        // Ignora errori di generazioni cancellate
        if (currentGenerationRef.current !== editGenerationId) return
        console.error('Errore durante la modifica del messaggio:', error)
        const errorDescription = formatUserFriendlyError(error)

        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === conversationId
              ? {
                  ...conv,
                  messages: conv.messages.map((message) =>
                    message.id === loaderId
                      ? {
                          id: createId(),
                          role: 'assistant',
                          error: errorDescription,
                        }
                      : message
                  ),
                }
              : conv
          ),
        )
        setErrorMessage(errorDescription)
      } finally {
        setIsSending(false)
      }
    },
    [
      conversations,
      isSending,
      deleteRemoteMessages,
      convertMessagesToOpenAIFormat,
      appendMessages,
      updateRemoteConversationContext,
    ],
  )

  const handleSignOut = useCallback(async () => {
    try {
      await supabase.auth.signOut()
      setIsProfileOpen(false)
    } catch (error) {
      console.error('Errore durante il logout:', error)
    }
  }, [])

  const handleProfileUpdated = useCallback(
    async (maybeUser) => {
      try {
        const nextUser = maybeUser ?? (await supabase.auth.getUser()).data?.user ?? null
        if (!nextUser) return
        setSession((prev) => (prev ? { ...prev, user: nextUser } : prev))
        const { email = '', user_metadata: metadata = {} } = nextUser
        setUserProfile({
          email,
          firstName: metadata.first_name ?? '',
          lastName: metadata.last_name ?? '',
        })
      } catch (error) {
        console.error('Errore durante l’aggiornamento del profilo:', error)
      }
    },
    [],
  )

  const handleProfileClick = useCallback(() => {
    setIsProfileOpen(true)
  }, [])

  const handleProfileClose = useCallback(() => {
    setIsProfileOpen(false)
  }, [])

  if (!isAuthReady) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        <div className="fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white via-slate-50/50 to-white" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(47,154,167,0.08),transparent_50%)]" />
        </div>
        <div className="flex flex-col items-center gap-3">
          <span className="inline-flex h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-[#7B1F34]" />
          <p className="text-sm">Verifica della sessione in corso…</p>
        </div>
      </div>
    )
  }

  if (pathname.startsWith('/auth/reset')) {
    return <ResetPassword onComplete={() => (window.location.href = '/')} />
  }

  if (pathname === '/termini-e-condizioni') {
    return <TerminiECondizioni />
  }

  if (pathname === '/privacy-policy') {
    return <PrivacyPolicy />
  }

  if (pathname === '/cookie-policy') {
    return <CookiePolicy />
  }

  if (!session) {
    return <LandingPage />
  }

  if (isLoadingConversations) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        <div className="fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white via-slate-50/50 to-white" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(47,154,167,0.08),transparent_50%)]" />
        </div>
        <div className="flex flex-col items-center gap-3">
          <span className="inline-flex h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-[#7B1F34]" />
          <p className="text-sm">Caricamento delle conversazioni in corso…</p>
        </div>
      </div>
    )
  }


  return (
    <div className="flex h-screen text-[#1f2933] overflow-hidden">
      {/* Background decorativo moderno */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white via-slate-50/50 to-white" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(47,154,167,0.06),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(62,184,168,0.04),transparent_50%)]" />
        <svg className="absolute inset-0 h-full w-full opacity-[0.02]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="app-grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="currentColor" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#app-grid)" />
        </svg>
      </div>

      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversation?.id ?? null}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
        userName={userProfile.firstName || userProfile.email?.split('@')[0] || ''}
        onProfileClick={handleProfileClick}
        onTemplatesClick={() => setIsTemplatesOpen(true)}
        onLegislationClick={() => setIsLegislationOpen(true)}
      />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div className="border-b border-slate-200/50 bg-white/80 backdrop-blur-sm px-4 py-4 md:hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Chat attiva</p>
              <p className="mt-1 text-sm font-semibold text-slate-700">{activeConversation?.title ?? 'Nessuna chat'}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleNewConversation}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:border-[#7B1F34] hover:bg-white hover:text-[#7B1F34] hover:shadow-md"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
                </svg>
                Nuova chat
              </button>
              <button
                type="button"
                onClick={handleProfileClick}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white/90 text-slate-500 shadow-sm transition-all hover:border-[#7B1F34] hover:bg-white hover:text-[#7B1F34] hover:shadow-md"
                title="Profilo"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="h-4 w-4"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 7.5a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a8.25 8.25 0 1115 0" />
                </svg>
              </button>
            </div>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {conversations.map((conversation) => {
              const isActive = conversation.id === activeConversation?.id
              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => handleSelectConversation(conversation.id)}
                  className={`whitespace-nowrap rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-[#7B1F34] to-[#9E3A50] text-white shadow-lg shadow-[#7B1F34]/30'
                      : 'bg-white/90 text-slate-600 shadow-sm hover:bg-white hover:text-slate-800 hover:shadow-md'
                  }`}
                >
                  {conversation.title}
                </button>
              )
            })}
          </div>
        </div>
        <main 
          className="relative flex flex-1 flex-col overflow-hidden"
          onDragOver={(e) => { e.preventDefault(); setIsDragOverChat(true) }}
          onDragLeave={(e) => { if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget)) setIsDragOverChat(false) }}
          onDrop={(e) => { e.preventDefault(); setIsDragOverChat(false); if (e.dataTransfer.files?.length) handleFilesAdd(Array.from(e.dataTransfer.files)) }}
        >
          {isDragOverChat && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm border-2 border-dashed border-rose-700 rounded-xl m-2 pointer-events-none">
              <div className="text-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto h-12 w-12 text-rose-900 mb-3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-lg font-semibold text-rose-900">Rilascia i file qui</p>
                <p className="text-sm text-rose-900 mt-1">PDF, Word o immagini</p>
              </div>
            </div>
          )}
          <ChatHistory 
            messages={messages} 
            activeConversationId={activeConversationId}
            onEditMessage={handleEditMessage}
          />
          <MessageComposer
            text={draftText}
            onTextChange={setDraftText}
            onFilesAdd={handleFilesAdd}
            selectedFiles={draftFiles}
            onFileRemove={(index) => setDraftFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index))}
            onSubmit={handleSubmit}
            isSending={isSending}
            onCancelSending={handleCancelSending}
            errorMessage={errorMessage}
            onWorkflowTrigger={handleWorkflowTrigger}
            onOpenActionsModal={() => setIsActionsModalOpen(true)}
          />
      <MedicalLegalActions
        isOpen={isActionsModalOpen}
        onClose={() => setIsActionsModalOpen(false)}
        onActionSelect={handleActionSelect}
        isSending={isSending}
      />
      <DocumentSelector
        isOpen={isDocumentSelectorOpen}
        onClose={() => setIsDocumentSelectorOpen(false)}
        onSelect={handleDocumentSelect}
        documents={pendingTranscriptionFiles}
        title="Quale documento vuoi trascrivere?"
        description="Seleziona un documento o scegli di trascriverli tutti"
      />
        </main>
      </div>
      <ProfileDialog
        isOpen={isProfileOpen}
        onClose={handleProfileClose}
        profile={userProfile}
        onProfileUpdated={handleProfileUpdated}
        onSignOut={handleSignOut}
      />
      {isTemplatesOpen && (
        <DocumentTemplates onClose={() => setIsTemplatesOpen(false)} />
      )}
      {isLegislationOpen && (
        <LegislationSearch onClose={() => setIsLegislationOpen(false)} />
      )}
      {/* STRIPE_DISABLED: Modale abbonamenti nascosta temporaneamente */}
      {/* {isSubscriptionOpen && (
        <div className="fixed inset-0 z-50">
          <SubscriptionPlans onBack={() => setIsSubscriptionOpen(false)} />
        </div>
      )} */}
      {/* Componente temporaneo per generare embeddings - RIMUOVERE DOPO L'USO */}
      {/* Usa lo script: npm run generate-embeddings */}
    </div>
  )
}

export default App
