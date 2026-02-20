/**
 * Backend Client
 * Gestisce comunicazione con il server per elaborazione documenti
 */

import { io } from 'socket.io-client'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

let socket = null
let isConnected = false
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 5

// Event handlers registrati
const eventHandlers = new Map()

/**
 * Inizializza connessione WebSocket
 */
export function initBackendConnection(userId) {
  if (socket?.connected) {
    return socket
  }

  socket = io(BACKEND_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
    reconnectionDelay: 1000,
    timeout: 10000
  })

  socket.on('connect', () => {
    console.log('Connected to backend server')
    isConnected = true
    reconnectAttempts = 0
    
    // Autentica utente
    if (userId) {
      socket.emit('auth', { userId })
    }
  })

  socket.on('auth:success', (data) => {
    console.log('Authenticated with backend:', data)
  })

  socket.on('disconnect', (reason) => {
    console.log('Disconnected from backend:', reason)
    isConnected = false
  })

  socket.on('connect_error', (error) => {
    console.warn('Backend connection error:', error.message)
    reconnectAttempts++
  })

  // Gestori eventi batch
  socket.on('batch:start', (data) => {
    triggerEvent('batch:start', data)
  })

  socket.on('job:progress', (data) => {
    triggerEvent('job:progress', data)
  })

  socket.on('job:complete', (data) => {
    triggerEvent('job:complete', data)
  })

  socket.on('job:error', (data) => {
    triggerEvent('job:error', data)
  })

  socket.on('batch:complete', (data) => {
    triggerEvent('batch:complete', data)
  })

  return socket
}

/**
 * Registra handler per eventi
 */
export function onBackendEvent(event, handler) {
  if (!eventHandlers.has(event)) {
    eventHandlers.set(event, new Set())
  }
  eventHandlers.get(event).add(handler)
  
  return () => {
    eventHandlers.get(event)?.delete(handler)
  }
}

/**
 * Trigger evento a tutti gli handler
 */
function triggerEvent(event, data) {
  eventHandlers.get(event)?.forEach(handler => {
    try {
      handler(data)
    } catch (e) {
      console.error('Event handler error:', e)
    }
  })
}

/**
 * Verifica se il backend è disponibile
 */
export async function isBackendAvailable() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    })
    return response.ok
  } catch (e) {
    return false
  }
}

/**
 * Upload documenti al backend per elaborazione
 * @param {File[]} files - Array di file da elaborare
 * @param {string} conversationId - ID conversazione
 * @param {string} userId - ID utente
 * @returns {Promise<{batchId: string, jobs: Array}>}
 */
export async function uploadDocumentsToBackend(files, conversationId, userId) {
  const formData = new FormData()
  
  files.forEach(file => {
    formData.append('files', file)
  })
  formData.append('conversationId', conversationId)
  formData.append('userId', userId)
  
  const response = await fetch(`${BACKEND_URL}/api/documents/upload`, {
    method: 'POST',
    body: formData
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Errore upload documenti')
  }
  
  return response.json()
}

/**
 * Controlla stato batch
 */
export async function checkBatchStatus(batchId) {
  const response = await fetch(`${BACKEND_URL}/api/documents/status/${batchId}`)
  
  if (!response.ok) {
    throw new Error('Batch non trovato')
  }
  
  return response.json()
}

/**
 * Annulla elaborazione batch
 */
export async function cancelBatch(batchId) {
  const response = await fetch(`${BACKEND_URL}/api/documents/cancel/${batchId}`, {
    method: 'POST'
  })
  
  return response.json()
}

/**
 * Disconnetti dal backend
 */
export function disconnectBackend() {
  if (socket) {
    socket.disconnect()
    socket = null
    isConnected = false
  }
}

/**
 * Ottieni stato connessione
 */
export function getConnectionStatus() {
  return {
    isConnected,
    reconnectAttempts,
    socketId: socket?.id
  }
}
