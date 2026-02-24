import { useEffect, useMemo, useRef, useState } from 'react'

const formatDate = (isoString) => {
  if (!isoString) return ''
  const date = new Date(isoString)
  return date.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function Sidebar({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onRenameConversation,
  onProfileClick,
  onTemplatesClick,
  onLegislationClick,
  userName,
}) {
  const items = useMemo(
    () =>
      conversations.map((conversation) => ({
        ...conversation,
        formattedDate: formatDate(conversation.createdAt),
      })),
    [conversations],
  )

  const [editingId, setEditingId] = useState(null)
  const [draftTitle, setDraftTitle] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (!editingId) return
    const exists = items.some((conversation) => conversation.id === editingId)
    if (!exists) {
      setEditingId(null)
      setDraftTitle('')
    }
  }, [editingId, items])

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingId])

  const beginEditing = (conversation) => {
    if (!onRenameConversation) return
    setEditingId(conversation.id)
    setDraftTitle(conversation.title ?? '')
  }

  const cancelEditing = () => {
    setEditingId(null)
    setDraftTitle('')
  }

  const submitEditing = async (conversation) => {
    if (!onRenameConversation) {
      cancelEditing()
      return
    }
    const trimmed = draftTitle.trim()
    if (!trimmed || trimmed === conversation.title) {
      cancelEditing()
      return
    }
    try {
      await onRenameConversation(conversation.id, trimmed)
    } finally {
      cancelEditing()
    }
  }

  return (
    <aside className="hidden w-72 flex-shrink-0 flex-col border-r border-slate-200/50 bg-white/90 backdrop-blur-sm text-[#1f2933] shadow-xl md:flex h-screen overflow-hidden">
      {/* Header Sidebar */}
      <div className="flex items-center justify-between border-b border-slate-200/50 px-5 py-5">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-400" style={{ verticalAlign: 'top' }}>Conversazioni</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onNewConversation}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-all hover:border-[#2f9aa7] hover:bg-[#2f9aa7] hover:text-white hover:shadow-md"
          title="Nuova conversazione"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-4 w-4"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
          </svg>
        </button>
      </div>
      
      {/* Lista Conversazioni */}
      <div className="relative flex flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-3 pb-[142px] pt-3">
          <div className="space-y-2">
            {items.map((conversation) => {
              const isActive = conversation.id === activeConversationId
              return (
                <div
                  key={conversation.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectConversation(conversation.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelectConversation(conversation.id)
                    }
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation()
                    beginEditing(conversation)
                  }}
                  className={`group relative flex w-full items-center rounded-xl border px-4 py-3 transition-all ${
                    isActive
                      ? 'border-[#2f9aa7]/30 bg-gradient-to-r from-[#2f9aa7]/10 to-[#3eb8a8]/5 text-slate-800 shadow-md shadow-[#2f9aa7]/10'
                      : 'border-transparent bg-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-50/50 hover:text-slate-700'
                  }`}
                >
                  {editingId === conversation.id ? (
                    <input
                      ref={inputRef}
                      value={draftTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      onBlur={() => submitEditing(conversation)}
                      onClick={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          submitEditing(conversation)
                        } else if (event.key === 'Escape') {
                          event.preventDefault()
                          cancelEditing()
                        }
                      }}
                      className="mr-3 w-full truncate rounded-lg border border-[#2f9aa7] bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-lg outline-none focus:ring-2 focus:ring-[#2f9aa7]/20"
                      maxLength={120}
                      aria-label="Rinomina conversazione"
                    />
                  ) : (
                    <span className="select-text flex-1 truncate text-left text-sm font-semibold">
                      {conversation.title}
                    </span>
                  )}
                  {onDeleteConversation ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        if (window.confirm(`Sei sicuro di voler eliminare la conversazione "${conversation.title}"?`)) {
                          onDeleteConversation(conversation.id)
                        }
                      }}
                      className="ml-3 inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 opacity-0 shadow-sm transition-all group-hover:opacity-100 hover:border-red-300 hover:bg-red-50 hover:text-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
                      aria-label={`Elimina ${conversation.title}`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="h-4 w-4"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12m-1 0l-.867 12.142A2 2 0 0114.138 21H9.862a2 2 0 01-1.995-1.858L7 7m5-3.5a1.5 1.5 0 00-3 0V7m3-3.5a1.5 1.5 0 013 0V7" />
                      </svg>
                    </button>
                  ) : null}
                </div>
              )
            })}
            {!items.length ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="mt-3 text-sm font-medium text-slate-400">Nessuna conversazione</p>
                <p className="mt-1 text-xs text-slate-300">Crea una nuova chat per iniziare</p>
              </div>
            ) : null}
          </div>
        </div>
        
        {/* Footer Sidebar - Bottoni Template e Profilo */}
        <div className="sticky inset-x-0 bottom-0 space-y-3 border-t border-slate-200/50 bg-white/80 px-5 pb-6 pt-4 backdrop-blur-sm">
          {/* Pulsante Templates */}
          <button
            type="button"
            onClick={onTemplatesClick}
            className="group flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600 shadow-sm transition-all hover:border-[#2f9aa7] hover:bg-gradient-to-r hover:from-[#2f9aa7]/5 hover:to-[#3eb8a8]/5 hover:text-[#2f9aa7] hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-[#2f9aa7]/10 to-[#3eb8a8]/10 text-[#2f9aa7] shadow-sm transition-all group-hover:from-[#2f9aa7]/20 group-hover:to-[#3eb8a8]/20">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </span>
              <div className="flex flex-col items-start text-left">
                <span className="font-semibold text-slate-700 group-hover:text-[#2f9aa7] transition-colors">Templates</span>
                <span className="text-xs text-slate-400">Emula i tuoi pareri</span>
              </div>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 text-slate-400 group-hover:text-[#2f9aa7] transition-colors">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          {/* Pulsante Legislazione */}
          <button
            type="button"
            onClick={onLegislationClick}
            className="group flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600 shadow-sm transition-all hover:border-[#2f9aa7] hover:bg-gradient-to-r hover:from-[#2f9aa7]/5 hover:to-[#3eb8a8]/5 hover:text-[#2f9aa7] hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-[#2f9aa7]/10 to-[#3eb8a8]/10 text-[#2f9aa7] shadow-sm transition-all group-hover:from-[#2f9aa7]/20 group-hover:to-[#3eb8a8]/20">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.97zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.97z" />
                </svg>
              </span>
              <div className="flex flex-col items-start text-left">
                <span className="font-semibold text-slate-700 group-hover:text-[#2f9aa7] transition-colors">Legislazione</span>
                <span className="text-xs text-slate-400">Leggi e norme italiane</span>
              </div>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 text-slate-400 group-hover:text-[#2f9aa7] transition-colors">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onProfileClick}
            className="group flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-slate-100 to-slate-200 text-slate-500 shadow-sm">
                <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-11 w-11">
                  <rect x="2" y="2" width="60" height="60" rx="30" fill="#e0f2f1" />
                  <path
                    d="M32 31c4.694 0 8.5-3.806 8.5-8.5S36.694 14 32 14s-8.5 3.806-8.5 8.5S27.306 31 32 31Z"
                    fill="#2c7a7b"
                  />
                  <path
                    d="M21.6 38.4c0-2.43 1.97-4.4 4.4-4.4h12c2.43 0 4.4 1.97 4.4 4.4V46a4 4 0 01-4 4H25.6a4 4 0 01-4-4v-7.6Z"
                    fill="#2f9aa7"
                  />
                  <path
                    d="M28 44h8M32 40v8"
                    stroke="#e7f8f8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <div className="flex flex-col items-start text-left">
                <span className="select-text font-semibold text-slate-700">{userName || 'Profilo'}</span>
                <span className="select-text text-xs text-slate-400">Gestisci account</span>
              </div>
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-5 w-5 text-slate-400"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  )
}
