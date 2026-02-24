import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import ChatMessage from './ChatMessage'

export default function ChatHistory({ messages, activeConversationId, onEditMessage }) {
  const containerRef = useRef(null)
  const scrollTimeoutRef = useRef(null)
  const lastScrollTopRef = useRef(0)
  const [userScrolledUp, setUserScrolledUp] = useState(false)
  const [showScrollButton, setShowScrollButton] = useState(false)

  // Crea un fingerprint del contenuto per rilevare cambiamenti anche durante lo streaming
  const contentFingerprint = useMemo(() => {
    return messages.map((msg) => `${msg.id}:${msg.text?.length || 0}:${msg.isStreaming || false}:${msg.isLoading || false}`).join('|')
  }, [messages])

  // Rileva quando l'utente scrolla manualmente
  const handleScroll = useCallback(() => {
    const node = containerRef.current
    if (!node) return

    const isNearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 150
    const hasEnoughContent = node.scrollHeight > node.clientHeight + 200 // La chat è lunga
    
    // Mostra il bottone solo se la chat è lunga E l'utente non è in fondo
    setShowScrollButton(hasEnoughContent && !isNearBottom)
    
    // Se l'utente sta scrollando verso l'alto (lontano dal fondo), segna che ha scrollato
    if (!isNearBottom && node.scrollTop < lastScrollTopRef.current) {
      setUserScrolledUp(true)
    }
    
    // Se l'utente torna in fondo, resetta il flag
    if (isNearBottom) {
      setUserScrolledUp(false)
    }
    
    lastScrollTopRef.current = node.scrollTop
  }, [])

  // NO auto-scroll durante lo streaming - l'utente controlla lo scroll
  // Lo scroll automatico avviene SOLO quando viene aggiunto un nuovo messaggio iniziale
  useEffect(() => {
    // Non fare nulla durante lo streaming - l'utente può scrollare liberamente
    const hasStreaming = messages.some((msg) => msg.isStreaming || msg.isLoading)
    if (hasStreaming) return
    
    // Niente auto-scroll se l'utente ha già scrollato su
    if (userScrolledUp) return
    
    // Scroll in fondo solo quando un nuovo messaggio viene completato
    const node = containerRef.current
    if (!node) return
    
    const isNearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 300
    if (isNearBottom) {
      node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
    }
  }, [messages.length, userScrolledUp])

  // Resetta lo scroll quando arriva un nuovo messaggio dall'utente
  useEffect(() => {
    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.role === 'user') {
      setUserScrolledUp(false)
      const node = containerRef.current
      if (node) {
        node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
      }
    }
  }, [messages.length])

  // Registra l'event listener per lo scroll
  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    node.addEventListener('scroll', handleScroll, { passive: true })
    return () => node.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  // Controlla se mostrare il bottone all'inizio e quando cambiano i messaggi
  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    
    const hasEnoughContent = node.scrollHeight > node.clientHeight + 200
    const isNearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 150
    setShowScrollButton(hasEnoughContent && !isNearBottom)
  }, [messages.length, contentFingerprint])

  // Funzione per scrollare in fondo
  const scrollToBottom = useCallback(() => {
    const node = containerRef.current
    if (!node) return
    
    setUserScrolledUp(false)
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
  }, [])

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden">
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto bg-[linear-gradient(134deg,rgba(255,255,255,1)_0%,rgba(248,250,252,0.5)_50%,rgba(255,255,255,1)_100%)] px-6 py-12 sm:px-8"
        aria-live="polite"
      >
        <div className="mx-auto w-full max-w-6xl min-h-full flex flex-col">
          {messages.length > 0 ? (
            <div className="space-y-6 mt-auto">
              {messages.map((message) => (
                <ChatMessage 
                  key={message.id} 
                  message={message}
                  conversationId={activeConversationId}
                  onEditMessage={onEditMessage}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center max-w-md">
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Bottone scroll to bottom */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-lg border-2 border-rose-900 hover:bg-teal-50 transition-all duration-200 hover:shadow-xl"
          aria-label="Vai in fondo alla chat"
          title="Vai in fondo alla chat"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className="h-5 w-5 text-teal-600"
          >
            <path d="M12 5v14M5 12l7 7 7-7"/>
          </svg>
        </button>
      )}
    </div>
  )
}

