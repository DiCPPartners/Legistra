import { useEffect, useRef, useState } from 'react'
import { fetchCustomCategories } from '../services/templates'

const LEGAL_ACTIONS = [
  {
    id: 'trascrizione',
    label: 'Trascrizione',
    description: 'Estrai e formatta il testo dai documenti PDF',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    iconColor: 'bg-slate-500 text-white',
    category: 'analisi',
  },
  {
    id: 'analisi-giuridica',
    label: 'Parere Pro Veritate',
    description: 'Genera un parere legale completo con analisi del caso e strategia',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.97zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.97z" />
      </svg>
    ),
    iconColor: 'bg-[#7B1F34] text-white',
    category: 'analisi',
  },
  {
    id: 'analisi-contrattuale',
    label: 'Analisi Contratto',
    description: 'Esamina clausole, rischi, inadempimenti e rimedi contrattuali',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    iconColor: 'bg-[#2563eb] text-white',
    category: 'analisi',
  },
  {
    id: 'elementi-critici',
    label: 'Strategia Difensiva',
    description: 'Punti di forza, debolezze, rischi e strategia processuale',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    iconColor: 'bg-[#dc2626] text-white',
    category: 'analisi',
  },
  {
    id: 'timeline-eventi',
    label: 'Cronologia Atti',
    description: 'Ricostruisci la timeline di fatti, atti e scadenze',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    iconColor: 'bg-[#d97706] text-white',
    category: 'analisi',
  },
  {
    id: 'estrazione-dati',
    label: 'Estrazione Dati',
    description: 'Estrai parti, importi, date, R.G. e dati chiave',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v.375" />
      </svg>
    ),
    iconColor: 'bg-[#7c3aed] text-white',
    category: 'analisi',
  },
  {
    id: 'confronto-documenti',
    label: 'Confronto Documenti',
    description: 'Confronta più documenti per incongruenze e contraddizioni',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
    iconColor: 'bg-[#0891b2] text-white',
    category: 'analisi',
  },
  {
    id: 'report-strutturato',
    label: 'Bozza Atto',
    description: 'Genera bozza di atto giudiziario dal fascicolo caricato',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
      </svg>
    ),
    iconColor: 'bg-[#059669] text-white',
    category: 'generazione',
  },
]

const CATEGORIES = {
  'analisi': { label: 'Analisi Documenti', color: 'bg-slate-100 text-slate-700' },
  'generazione': { label: 'Generazione Documenti', color: 'bg-[#7B1F34]/10 text-[#7B1F34]' },
  personalizzate: { label: 'I Tuoi Template', color: 'bg-gradient-to-r from-[#8C2B42] to-[#B85468] text-white' },
}

export default function MedicalLegalActions({ isOpen, onClose, onActionSelect, isSending }) {
  const modalRef = useRef(null)
  const [customCategories, setCustomCategories] = useState([])
  const [isLoadingCategories, setIsLoadingCategories] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) onClose()
    }
    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    let isMounted = true
    const loadCategories = async () => {
      setIsLoadingCategories(true)
      try {
        const categories = await fetchCustomCategories()
        if (isMounted) setCustomCategories(categories)
      } catch (error) {
        console.error('Errore caricamento categorie personalizzate:', error)
      } finally {
        if (isMounted) setIsLoadingCategories(false)
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
    if (!acc[action.category]) acc[action.category] = []
    acc[action.category].push(action)
    return acc
  }, {})

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-[0_40px_120px_rgba(15,23,42,0.25)]"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-800">Azioni AI</h2>
            <p className="mt-1 text-sm text-slate-500">Cosa vuoi fare con i documenti caricati?</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700"
            disabled={isSending}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {Object.entries(actionsByCategory).map(([categoryId, actions]) => {
            const category = CATEGORIES[categoryId]
            return (
              <div key={categoryId} className="mb-6 last:mb-0">
                <h3 className={`mb-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${category.color}`}>
                  {category.label}
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {actions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => { onActionSelect(action.id); onClose() }}
                      disabled={isSending}
                      className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-[#7B1F34]/30 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className={`flex-shrink-0 ${action.iconColor} rounded-lg p-2`}>
                        {action.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-800 group-hover:text-[#7B1F34]">{action.label}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500 leading-snug">{action.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}

          {customCategories.length > 0 && (
            <div className="mb-6 last:mb-0">
              <h3 className={`mb-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${CATEGORIES.personalizzate.color}`}>
                {CATEGORIES.personalizzate.label}
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {customCategories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => { onActionSelect(`categoria-${category.id}`); onClose() }}
                    disabled={isSending || isLoadingCategories}
                    className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-[#7B1F34]/30 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="flex-shrink-0 rounded-lg p-2" style={{ backgroundColor: category.color || '#7B1F34', color: 'white' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-800 group-hover:text-[#7B1F34]">{category.name}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500 leading-snug">{category.description || 'Genera documento con il tuo stile'}</p>
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
