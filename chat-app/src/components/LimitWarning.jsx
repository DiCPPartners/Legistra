import { useMemo } from 'react'

export default function LimitWarning({ type, current, max, onDismiss, showDismiss = true }) {
  const percentage = useMemo(() => {
    if (!max || max === 0) return 0
    return Math.min((current / max) * 100, 100)
  }, [current, max])

  const isWarning = percentage >= 80 && percentage < 100
  const isError = percentage >= 100

  const messages = {
    files: {
      warning: `Stai raggiungendo il limite di file. Hai caricato ${current} di ${max} file consentiti.`,
      error: `Hai raggiunto il limite massimo di ${max} file. Rimuovi alcuni file prima di aggiungerne altri.`,
    },
    fileSize: {
      warning: `La dimensione totale dei file si sta avvicinando al limite. Dimensione attuale: ${formatSize(current)} di ${formatSize(max)} consentiti.`,
      error: `La dimensione totale dei file ha superato il limite di ${formatSize(max)}. Rimuovi alcuni file prima di continuare.`,
    },
    conversations: {
      warning: `Stai raggiungendo il limite di conversazioni. Hai ${current} di ${max} conversazioni consentite.`,
      error: `Hai raggiunto il limite massimo di ${max} conversazioni. Elimina alcune conversazioni vecchie per crearne di nuove.`,
    },
    templates: {
      warning: `Stai raggiungendo il limite di template. Hai ${current} di ${max} template consentiti.`,
      error: `Hai raggiunto il limite massimo di ${max} template. Elimina alcuni template prima di aggiungerne altri.`,
    },
    messageLength: {
      warning: `Il messaggio è molto lungo (${current} caratteri). Limite: ${max} caratteri.`,
      error: `Il messaggio supera il limite di ${max} caratteri. Accorcia il messaggio prima di inviare.`,
    },
  }

  const messageConfig = messages[type] || messages.files
  const message = isError ? messageConfig.error : messageConfig.warning

  if (!isWarning && !isError) return null

  return (
    <div
      className={`mb-3 rounded-xl border px-4 py-3 text-sm shadow-sm ${
        isError
          ? 'border-red-300 bg-red-50 text-red-700'
          : 'border-amber-300 bg-amber-50 text-amber-700'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          {isError ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          )}
        </div>
        <div className="flex-1">
          <p className="font-semibold">{isError ? 'Limite Raggiunto' : 'Avviso Limite'}</p>
          <p className="mt-1">{message}</p>
          {percentage > 0 && (
            <div className="mt-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full transition-all ${
                    isError ? 'bg-red-500' : 'bg-amber-500'
                  }`}
                  style={{ width: `${Math.min(percentage, 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs opacity-75">{Math.round(percentage)}% utilizzato</p>
            </div>
          )}
        </div>
        {showDismiss && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="flex-shrink-0 rounded-lg p-1 transition hover:bg-white/50"
            aria-label="Chiudi avviso"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-4 w-4"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}
