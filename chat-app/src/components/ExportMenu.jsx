/**
 * Menu per esportazione documenti (PDF, Word, Clipboard)
 */

import { useState, useRef, useEffect } from 'react'
import { exportToPDF, exportToWord, copyToClipboard } from '../services/export'

export default function ExportMenu({ 
  content, 
  title = 'Report',
  messages = [],
  metadata = {},
  position = 'bottom-right', // 'bottom-right', 'bottom-left', 'top-right', 'top-left'
  customStyles = null // Stili di formattazione estratti dal template
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState(null)
  const menuRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleExport = async (format) => {
    setIsExporting(true)
    setExportStatus(null)

    try {
      const options = {
        title,
        content,
        messages,
        metadata,
        download: true,
        customStyles // Passa gli stili personalizzati per l'esportazione
      }

      switch (format) {
        case 'pdf':
          await exportToPDF(options)
          setExportStatus({ type: 'success', message: 'PDF scaricato' })
          break
        case 'word':
          await exportToWord(options)
          setExportStatus({ type: 'success', message: 'Word scaricato' })
          break
        case 'clipboard':
          await copyToClipboard(content)
          setExportStatus({ type: 'success', message: 'Copiato!' })
          break
      }

      setTimeout(() => {
        setExportStatus(null)
        setIsOpen(false)
      }, 1500)

    } catch (error) {
      console.error('Errore export:', error)
      setExportStatus({ type: 'error', message: 'Errore durante l\'esportazione' })
    } finally {
      setIsExporting(false)
    }
  }

  const positionClasses = {
    'bottom-right': 'top-full right-0 mt-2',
    'bottom-left': 'top-full left-0 mt-2',
    'top-right': 'bottom-full right-0 mb-2',
    'top-left': 'bottom-full left-0 mb-2'
  }

  return (
    <div className="relative inline-block" ref={menuRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-[#7B1F34] hover:bg-[#7B1F34] hover:text-white hover:shadow-md disabled:opacity-50"
        title="Esporta"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
          <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
          <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
        </svg>
        Esporta
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className={`absolute z-50 w-48 rounded-xl border border-slate-200 bg-white shadow-lg ${positionClasses[position]}`}>
          <div className="p-1">
            {/* PDF */}
            <button
              type="button"
              onClick={() => handleExport('pdf')}
              disabled={isExporting}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </span>
              <div>
                <p className="font-medium">PDF</p>
                <p className="text-xs text-slate-500">Documento stampabile</p>
              </div>
            </button>

            {/* Word */}
            <button
              type="button"
              onClick={() => handleExport('word')}
              disabled={isExporting}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </span>
              <div>
                <p className="font-medium">Word</p>
                <p className="text-xs text-slate-500">Modificabile</p>
              </div>
            </button>

          </div>

          {/* Status */}
          {exportStatus && (
            <div className={`border-t border-slate-100 px-3 py-2 text-xs text-center ${
              exportStatus.type === 'success' ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'
            }`}>
              {exportStatus.message}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
