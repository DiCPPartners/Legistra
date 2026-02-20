import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LimitWarning from './LimitWarning'
import {
  MAX_FILES_COUNT,
  MAX_TOTAL_FILE_SIZE_BYTES,
  MAX_MESSAGE_LENGTH,
  WARNING_FILE_COUNT_THRESHOLD,
  WARNING_FILE_SIZE_THRESHOLD,
  WARNING_MESSAGE_LENGTH_THRESHOLD,
  formatFileSize,
} from '../config/webhooks'

export default function MessageComposer({
  text,
  onTextChange,
  selectedFiles,
  onFilesAdd,
  onFileRemove,
  onSubmit,
  isSending,
  onCancelSending,
  errorMessage,
  onWorkflowTrigger,
  onOpenActionsModal,
}) {
  const fileInputRef = useRef(null)
  const filesScrollRef = useRef(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const [dismissedWarnings, setDismissedWarnings] = useState(new Set())
  const [readyFiles, setReadyFiles] = useState(new Set())

  // Calcola statistiche file
  const fileStats = useMemo(() => {
    const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0)
    const fileCount = selectedFiles.length
    const totalSizePercentage = (totalSize / MAX_TOTAL_FILE_SIZE_BYTES) * 100
    const fileCountPercentage = (fileCount / MAX_FILES_COUNT) * 100

    return {
      totalSize,
      fileCount,
      totalSizePercentage,
      fileCountPercentage,
    }
  }, [selectedFiles])

  // Calcola lunghezza messaggio
  const messageLength = useMemo(() => text?.length || 0, [text])

  // Simula il caricamento dei file e li marca come pronti
  useEffect(() => {
    const fileKeys = selectedFiles.map((f, i) => `${f.name}-${f.size}-${i}`)
    const newReadyFiles = new Set(readyFiles)
    const timeouts = []
    
    // Rimuovi file che non esistono più
    for (const key of newReadyFiles) {
      if (!fileKeys.some(fk => fk.startsWith(key.split('-').slice(0, -1).join('-')))) {
        newReadyFiles.delete(key)
      }
    }
    
    // Aggiungi nuovi file con delay simulato
    fileKeys.forEach((key, index) => {
      if (!readyFiles.has(key)) {
        // Simula tempo di verifica file (300-800ms basato sulla dimensione)
        const file = selectedFiles[index]
        const delay = Math.min(300 + Math.floor(file.size / 100000) * 100, 800)
        
        const timeout = setTimeout(() => {
          setReadyFiles(prev => new Set(prev).add(key))
        }, delay)
        timeouts.push(timeout)
      }
    })
    
    if (newReadyFiles.size !== readyFiles.size) {
      setReadyFiles(newReadyFiles)
    }
    
    // Cleanup: cancella tutti i timeout pendenti
    return () => {
      timeouts.forEach(timeout => clearTimeout(timeout))
    }
  }, [selectedFiles])

  // Scroll automatico quando vengono aggiunti file
  useEffect(() => {
    if (filesScrollRef.current && selectedFiles.length > 0) {
      filesScrollRef.current.scrollLeft = filesScrollRef.current.scrollWidth
    }
  }, [selectedFiles.length])

  const handleFileSelection = useCallback(
    (fileList) => {
      if (!fileList?.length) return
      onFilesAdd(Array.from(fileList))
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [onFilesAdd],
  )

  const handleDrop = (event) => {
    event.preventDefault()
    setIsDragActive(false)
    handleFileSelection(event.dataTransfer.files)
  }

  const handleDragOver = (event) => {
    event.preventDefault()
    setIsDragActive(true)
  }

  const handleDragLeave = () => setIsDragActive(false)

  const handleSubmit = (event) => {
    event.preventDefault()
    onSubmit()
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onSubmit()
    }
  }

  return (
    <div
      className={`sticky bottom-0 left-0 right-0 border-t border-slate-200/50 bg-gradient-to-t from-white via-white/95 to-white/90 pb-safe backdrop-blur-lg transition-all duration-300 ${
        isDragActive ? 'bg-gradient-to-t from-[#2f9aa7]/5 via-[#2f9aa7]/5 to-transparent border-[#2f9aa7]/30 shadow-[0_-8px_30px_rgba(47,154,167,0.1)]' : 'shadow-[0_-4px_20px_rgba(0,0,0,0.03)]'
      }`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div className="mx-auto w-full max-w-6xl px-6 pt-5 pb-6">
        <div
          className={`overflow-hidden transition-all duration-300 ${
            selectedFiles.length ? 'max-h-32 opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          {selectedFiles.length ? (
            <div 
              ref={filesScrollRef}
              className="mb-4 flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent"
              style={{ scrollbarWidth: 'thin' }}
            >
              {selectedFiles.map((file, index) => {
                const fileKey = `${file.name}-${file.size}-${index}`
                const isReady = readyFiles.has(fileKey)
                
                return (
                  <div
                    key={fileKey}
                    className={`group relative flex flex-shrink-0 items-center gap-3 rounded-xl border bg-white/90 px-4 py-2.5 text-sm text-slate-700 shadow-md backdrop-blur-sm transition-all ${
                      isReady 
                        ? 'border-emerald-200 hover:border-emerald-300 hover:shadow-lg' 
                        : 'border-slate-200/50 hover:border-[#2f9aa7]/30 hover:shadow-lg'
                    }`}
                    style={{ minWidth: '220px', maxWidth: '280px' }}
                  >
                    {/* Indicatore stato */}
                    <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${
                      isReady
                        ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-600'
                        : 'border-slate-200/50 bg-gradient-to-br from-[#2f9aa7]/10 to-[#3eb8a8]/10 text-[#2f9aa7]'
                    }`}>
                      {isReady ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                          <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-800">{file.name}</p>
                      <p className="text-xs text-slate-500">
                        {file.size > 0 
                          ? file.size >= 1024 * 1024 
                            ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
                            : file.size >= 1024
                              ? `${(file.size / 1024).toFixed(0)} KB`
                              : `${file.size} B`
                          : 'Dimensione sconosciuta'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onFileRemove(index)}
                      className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 transition-all hover:bg-red-50 hover:text-red-500"
                      disabled={isSending}
                      title="Rimuovi file"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div
            className={`relative flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-xl transition-all duration-300 ${
              isDragActive 
                ? 'border-[#2f9aa7] bg-gradient-to-br from-[#2f9aa7]/5 to-[#3eb8a8]/5 shadow-[#2f9aa7]/20' 
                : 'border-slate-200 hover:border-slate-300 hover:shadow-2xl'
            } ${isSending ? 'opacity-60' : ''}`}
          >
            {/* Gradient glow effect */}
            <div className="pointer-events-none absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-[#2f9aa7]/20 via-transparent to-[#3eb8a8]/20 opacity-0 blur transition-opacity group-hover:opacity-100" />
            
            <div className="relative flex items-center gap-3">
              <button
                type="button"
                onClick={() => onOpenActionsModal?.()}
                className="group/btn inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition-all duration-200 hover:border-[#2f9aa7] hover:bg-[#2f9aa7] hover:text-white hover:shadow-lg hover:shadow-[#2f9aa7]/25 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSending}
                aria-label="Azioni medico-legali"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 transition-transform group-hover/btn:scale-110">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                <span className="hidden sm:inline">Azioni AI</span>
              </button>
              <input
                ref={fileInputRef}
                id="file-upload"
                type="file"
                accept="application/pdf,.pdf,.docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                multiple
                className="hidden"
                onChange={(event) => handleFileSelection(event.target.files)}
                disabled={isSending}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="group/upload inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-all duration-200 hover:border-[#2f9aa7] hover:bg-[#2f9aa7] hover:text-white hover:shadow-lg hover:shadow-[#2f9aa7]/25 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSending}
                title="Carica PDF o Word"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 transition-transform group-hover/upload:scale-110">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </button>
              <label htmlFor="message" className="sr-only">
                Messaggio
              </label>
              <textarea
                id="message"
                name="message"
                rows={1}
                className="flex-1 resize-none rounded-xl border-0 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none ring-1 ring-slate-200 transition-all duration-200 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-[#2f9aa7] disabled:cursor-not-allowed"
                placeholder="Scrivi un messaggio o carica documenti..."
                value={text}
                onChange={(event) => onTextChange(event.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isSending}
              />
              <button
                type={isSending ? "button" : "submit"}
                onClick={isSending ? onCancelSending : undefined}
                className={`group/send relative inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl text-white shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  isSending 
                    ? 'bg-gradient-to-r from-red-500 to-red-600 shadow-red-500/30 hover:shadow-red-500/40 focus-visible:outline-red-500' 
                    : 'bg-gradient-to-r from-[#2f9aa7] to-[#3eb8a8] shadow-[#2f9aa7]/30 hover:shadow-[#2f9aa7]/40 focus-visible:outline-[#2f9aa7]'
                }`}
                aria-label={isSending ? "Annulla elaborazione" : "Invia messaggio"}
                title={isSending ? "Clicca per annullare l'elaborazione" : "Invia messaggio"}
              >
                <div className={`absolute inset-0 opacity-0 transition-opacity group-hover/send:opacity-100 ${
                  isSending 
                    ? 'bg-gradient-to-r from-red-600 to-red-500' 
                    : 'bg-gradient-to-r from-[#3eb8a8] to-[#2f9aa7]'
                }`} />
                {isSending ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="relative h-5 w-5">
                    <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="relative h-5 w-5 transition-transform group-hover/send:translate-x-0.5 group-hover/send:-translate-y-0.5">
                    <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Avvisi Limiti File */}
          {fileStats.fileCount >= WARNING_FILE_COUNT_THRESHOLD &&
            !dismissedWarnings.has('fileCount') && (
              <LimitWarning
                type="files"
                current={fileStats.fileCount}
                max={MAX_FILES_COUNT}
                onDismiss={() => setDismissedWarnings((prev) => new Set(prev).add('fileCount'))}
              />
            )}

          {fileStats.totalSizePercentage >= WARNING_FILE_SIZE_THRESHOLD * 100 &&
            !dismissedWarnings.has('fileSize') && (
              <LimitWarning
                type="fileSize"
                current={fileStats.totalSize}
                max={MAX_TOTAL_FILE_SIZE_BYTES}
                onDismiss={() => setDismissedWarnings((prev) => new Set(prev).add('fileSize'))}
              />
            )}

          {/* Avviso Lunghezza Messaggio */}
          {messageLength >= WARNING_MESSAGE_LENGTH_THRESHOLD &&
            !dismissedWarnings.has('messageLength') && (
              <LimitWarning
                type="messageLength"
                current={messageLength}
                max={MAX_MESSAGE_LENGTH}
                onDismiss={() =>
                  setDismissedWarnings((prev) => new Set(prev).add('messageLength'))
                }
              />
            )}

          {/* Messaggio Errore */}
          {errorMessage ? (
            <div className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-600 shadow-md backdrop-blur-sm">
              <div className="flex items-start gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-5 w-5 flex-shrink-0 mt-0.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
                <div className="flex-1">
                  <p className="font-semibold">Errore</p>
                  <p className="mt-1">{errorMessage}</p>
                </div>
              </div>
            </div>
          ) : null}

          {/* Informazioni File */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl border border-slate-200/50 bg-white/80 px-4 py-2.5 text-xs text-slate-600 shadow-sm backdrop-blur-sm">
                <span className="font-medium">
                  {selectedFiles.length} file selezionati • Totale:{' '}
                  {formatFileSize(fileStats.totalSize)}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-500">
                  {fileStats.fileCount}/{MAX_FILES_COUNT}
                </span>
              </div>
              <p className="text-center text-xs text-slate-500">
                I file vengono elaborati e conservati per 7 giorni, poi eliminati automaticamente.
              </p>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
