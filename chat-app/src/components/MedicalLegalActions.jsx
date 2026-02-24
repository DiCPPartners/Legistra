import { useEffect, useRef, useState } from 'react'
import { fetchCustomCategories } from '../services/templates'

const LEGAL_ACTIONS = [
  {
    id: 'trascrizione',
    label: 'Trascrizione Documentale',
    description: 'Estrai il testo dai documenti PDF',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3a3 3 0 00-3 3v5a3 3 0 006 0V6a3 3 0 00-3-3z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11v1a7 7 0 01-14 0v-1M12 19v2" />
      </svg>
    ),
    iconColor: 'bg-[#3b82f6] text-white', // Blu
    category: 'azioni-ai',
  },
  {
    id: 'analisi-giuridica',
    label: 'Analisi Giuridica',
    description: 'Analisi giuridica completa con qualificazione e valutazione',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 3v5a1 1 0 001 1h5" />
      </svg>
    ),
    iconColor: 'bg-[#10b981] text-white', // Verde
    category: 'azioni-ai',
  },
  {
    id: 'timeline-eventi',
    label: 'Cronologia Processuale',
    description: 'Crea la cronologia temporale degli eventi processuali',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    iconColor: 'bg-[#f59e0b] text-white', // Arancione
    category: 'azioni-ai',
  },
  {
    id: 'analisi-coerenza',
    label: 'Coerenza Documentale',
    description: 'Verifica coerenza tra atti, provvedimenti e documenti',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    iconColor: 'bg-[#8b5cf6] text-white', // Viola
    category: 'azioni-ai',
  },
  {
    id: 'responsabilita-professionale',
    label: 'Malpractice Preliminare',
    description: 'Valuta aderenza a norme professionali e deontologiche',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    iconColor: 'bg-[#ef4444] text-white', // Rosso
    category: 'azioni-ai',
  },
]

const CATEGORIES = {
  'azioni-ai': { label: 'Azioni AI', color: 'bg-[#e1eff2] text-[#2f9aa7]' },
  personalizzate: { label: 'Categorie Personalizzate', color: 'bg-gradient-to-r from-[#4fb3c1] to-[#48d1b5] text-white' },
}

export default function MedicalLegalActions({ isOpen, onClose, onActionSelect, isSending }) {
  const modalRef = useRef(null)
  const [customCategories, setCustomCategories] = useState([])
  const [isLoadingCategories, setIsLoadingCategories] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose()
      }
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    // Carica categorie personalizzate quando si apre il modal
    let isMounted = true
    const loadCategories = async () => {
      setIsLoadingCategories(true)
      try {
        const categories = await fetchCustomCategories()
        if (isMounted) {
          setCustomCategories(categories)
        }
      } catch (error) {
        console.error('Errore caricamento categorie personalizzate:', error)
      } finally {
        if (isMounted) {
          setIsLoadingCategories(false)
        }
      }
    }
    loadCategories()

    return () => {
      isMounted = false
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const actionsByCategory = LEGAL_ACTIONS.reduce((acc, action) => {
    if (!acc[action.category]) {
      acc[action.category] = []
    }
    acc[action.category].push(action)
    return acc
  }, {})

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="medical-actions-scrollbar w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-[0_40px_120px_rgba(15,23,42,0.25)]"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 backdrop-blur-sm">
          <div>
            <h2 className="text-xl font-semibold text-slate-800">Azioni Legali AI</h2>
            <p className="mt-1 text-sm text-slate-500">Scegli l'operazione da eseguire sui documenti</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Chiudi"
            disabled={isSending}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {Object.entries(actionsByCategory).map(([categoryId, actions]) => {
            const category = CATEGORIES[categoryId]
            return (
              <div key={categoryId} className="mb-8 last:mb-0">
                <h3 className={`mb-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${category.color}`}>
                  {category.label}
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {actions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => {
                        onActionSelect(action.id)
                        onClose()
                      }}
                      disabled={isSending}
                      className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-[#4fb3c1] hover:bg-[#f0f7f9] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className={`mt-0.5 flex-shrink-0 ${action.iconColor || 'bg-[#e1eff2] text-[#2f9aa7]'} rounded-lg p-2`}>
                        {action.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-800 group-hover:text-[#2f9aa7]">{action.label}</p>
                        <p className="mt-1 text-xs text-slate-500">{action.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}

          {/* Categorie Personalizzate */}
          {customCategories.length > 0 && (
            <div className="mb-8 last:mb-0">
              <h3 className={`mb-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${CATEGORIES.personalizzate.color}`}>
                {CATEGORIES.personalizzate.label}
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {customCategories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      // Usa il nome della categoria come actionId per generare documento con stile
                      onActionSelect(`categoria-${category.id}`)
                      onClose()
                    }}
                    disabled={isSending || isLoadingCategories}
                    className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-[#4fb3c1] hover:bg-[#f0f7f9] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="mt-0.5 flex-shrink-0 rounded-lg p-2" style={{ backgroundColor: category.color || '#4fb3c1', color: 'white' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-800 group-hover:text-[#2f9aa7]">{category.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{category.description || 'Genera documento con il tuo stile'}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
