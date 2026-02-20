import { useEffect, useRef } from 'react'

const formatBytes = (bytes) => {
  if (!bytes && bytes !== 0) return ''
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`
}

export default function DocumentSelector({ 
  isOpen, 
  onClose, 
  onSelect, 
  documents = [],
  title = 'Seleziona documento',
  description = 'Scegli quale documento vuoi trascrivere'
}) {
  const modalRef = useRef(null)

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

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white shadow-[0_40px_120px_rgba(15,23,42,0.25)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-800">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Chiudi"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Document List */}
        <div className="max-h-80 overflow-y-auto p-4">
          <div className="space-y-2">
            {documents.map((doc, index) => (
              <button
                key={`${doc.name}-${index}`}
                type="button"
                onClick={() => {
                  onSelect(doc, index)
                  onClose()
                }}
                className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-[#4fb3c1] hover:bg-[#f0f7f9] hover:shadow-md"
              >
                {/* PDF Icon */}
                <span className="flex-shrink-0 rounded-xl bg-red-50 p-3 text-red-500 group-hover:bg-red-100">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </span>
                
                {/* Document Info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800 group-hover:text-[#2f9aa7]">
                    {doc.name}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {formatBytes(doc.size)}
                  </p>
                </div>

                {/* Arrow */}
                <span className="flex-shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-[#4fb3c1]">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer with "All" option */}
        <div className="border-t border-slate-200 p-4">
          <button
            type="button"
            onClick={() => {
              onSelect(null, -1) // null indica "tutti i documenti"
              onClose()
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-slate-600 transition hover:border-[#4fb3c1] hover:bg-[#f0f7f9] hover:text-[#2f9aa7]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
            <span className="font-medium">Trascrivi tutti i documenti ({documents.length})</span>
          </button>
        </div>
      </div>
    </div>
  )
}
