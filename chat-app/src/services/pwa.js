/**
 * Servizio per gestione PWA
 */

let deferredPrompt = null
let swRegistration = null

/**
 * Registra il service worker
 */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.log('Service Worker non supportato')
    return null
  }
  
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    })
    
    swRegistration = registration
    
    console.log('Service Worker registrato:', registration.scope)
    
    // Controlla aggiornamenti
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing
      
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // Nuova versione disponibile
          console.log('Nuova versione disponibile')
          dispatchPWAEvent('update-available', { registration })
        }
      })
    })
    
    return registration
    
  } catch (error) {
    console.error('Errore registrazione Service Worker:', error)
    return null
  }
}

/**
 * Verifica se l'app è installata come PWA
 */
export function isPWAInstalled() {
  // Metodo 1: display-mode
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true
  }
  
  // Metodo 2: iOS Safari
  if (window.navigator.standalone === true) {
    return true
  }
  
  // Metodo 3: URL parameter (alcuni browser)
  if (document.referrer.includes('android-app://')) {
    return true
  }
  
  return false
}

/**
 * Verifica se l'installazione è possibile
 */
export function canInstall() {
  return deferredPrompt !== null
}

/**
 * Ascolta evento beforeinstallprompt
 */
export function listenForInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Previeni il prompt automatico
    event.preventDefault()
    
    // Salva l'evento per uso futuro
    deferredPrompt = event
    
    console.log('PWA installabile')
    dispatchPWAEvent('install-available')
  })
  
  // Rileva quando l'app viene installata
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    console.log('PWA installata')
    dispatchPWAEvent('installed')
  })
}

/**
 * Mostra il prompt di installazione
 */
export async function showInstallPrompt() {
  if (!deferredPrompt) {
    throw new Error('Installazione non disponibile')
  }
  
  // Mostra il prompt
  deferredPrompt.prompt()
  
  // Aspetta la risposta dell'utente
  const result = await deferredPrompt.userChoice
  
  // Pulisci il prompt
  deferredPrompt = null
  
  return result.outcome // 'accepted' o 'dismissed'
}

/**
 * Aggiorna il service worker
 */
export async function updateServiceWorker() {
  if (!swRegistration) {
    return false
  }
  
  try {
    await swRegistration.update()
    
    // Se c'è un worker in attesa, attivalo
    if (swRegistration.waiting) {
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' })
      return true
    }
    
    return false
  } catch (error) {
    console.error('Errore aggiornamento SW:', error)
    return false
  }
}

/**
 * Pulisce la cache del service worker
 */
export async function clearCache() {
  if (!swRegistration?.active) {
    return false
  }
  
  swRegistration.active.postMessage({ type: 'CLEAR_CACHE' })
  return true
}

/**
 * Verifica lo stato della connessione
 */
export function isOnline() {
  return navigator.onLine
}

/**
 * Ascolta cambiamenti di connessione
 */
export function listenForConnectivityChanges(callback) {
  const handleOnline = () => callback(true)
  const handleOffline = () => callback(false)
  
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  
  // Ritorna funzione di cleanup
  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
}

/**
 * Richiedi permesso notifiche push
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    throw new Error('Notifiche non supportate')
  }
  
  if (Notification.permission === 'granted') {
    return true
  }
  
  if (Notification.permission === 'denied') {
    throw new Error('Permesso notifiche negato')
  }
  
  const permission = await Notification.requestPermission()
  return permission === 'granted'
}

/**
 * Ottiene la subscription per push notifications
 */
export async function getPushSubscription() {
  if (!swRegistration) {
    throw new Error('Service Worker non registrato')
  }
  
  const subscription = await swRegistration.pushManager.getSubscription()
  return subscription
}

/**
 * Iscriviti alle push notifications
 */
export async function subscribeToPush(vapidPublicKey) {
  if (!swRegistration) {
    throw new Error('Service Worker non registrato')
  }
  
  // Richiedi permesso
  await requestNotificationPermission()
  
  // Converti la chiave VAPID
  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey)
  
  const subscription = await swRegistration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey
  })
  
  return subscription
}

/**
 * Helper per convertire la chiave VAPID
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  
  return outputArray
}

/**
 * Dispatch evento personalizzato PWA
 */
function dispatchPWAEvent(type, detail = {}) {
  window.dispatchEvent(new CustomEvent(`pwa:${type}`, { detail }))
}

/**
 * Inizializza PWA
 */
export async function initPWA() {
  // Ascolta prompt installazione
  listenForInstallPrompt()
  
  // Registra service worker
  const registration = await registerServiceWorker()
  
  // Controlla stato installazione
  const installed = isPWAInstalled()
  
  return {
    registration,
    installed,
    canInstall: canInstall(),
    isOnline: isOnline()
  }
}

export default {
  registerServiceWorker,
  isPWAInstalled,
  canInstall,
  listenForInstallPrompt,
  showInstallPrompt,
  updateServiceWorker,
  clearCache,
  isOnline,
  listenForConnectivityChanges,
  requestNotificationPermission,
  getPushSubscription,
  subscribeToPush,
  initPWA
}
