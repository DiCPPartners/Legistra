import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  fetchTemplatesByCategory,
  createTemplate,
  deleteTemplate,
  initializeDefaultCategories,
  countTemplatesByCategory,
  updateCategoryFormattingStyles,
  DEFAULT_CATEGORIES,
} from '../services/templates'
import {
  OPENAI_API_KEY,
  MAX_TEMPLATES_PER_CATEGORY,
  MAX_TOTAL_TEMPLATES,
  WARNING_TEMPLATES_THRESHOLD,
} from '../config/webhooks'
import { 
  formatWorkflowOutput,
  transcribeWithFallback,
  performOCRWithGemini,
  isGeminiVisionAvailable,
  analyzeDocumentFormatting,
} from '../services/openai'
import { extractTextFromPDF, convertPDFToImages, getTextStats } from '../services/pdfExtractor'
import { extractTextFromWord, isValidWordFile, extractStylesFromWord } from '../services/wordExtractor'

const CATEGORY_ICONS = {
  document: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  certificate: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
    </svg>
  ),
  clipboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  ),
  scale: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
    </svg>
  ),
  mail: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
}

const formatBytes = (bytes) => {
  if (!bytes && bytes !== 0) return ''
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`
}

const formatDate = (isoString) => {
  if (!isoString) return ''
  const date = new Date(isoString)
  return date.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const countWords = (text) => {
  if (!text) return 0
  return text.split(/\s+/).filter(w => w.length > 0).length
}

export default function DocumentTemplates({ onClose }) {
  const [categories, setCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [templates, setTemplates] = useState([])
  const [templateCounts, setTemplateCounts] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadFileName, setUploadFileName] = useState('')
  const [error, setError] = useState(null)
  const [showNewCategoryForm, setShowNewCategoryForm] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryDescription, setNewCategoryDescription] = useState('')
  const fileInputRef = useRef(null)

  // Carica le categorie all'avvio
  useEffect(() => {
    loadCategories()
  }, [])

  // Carica i template quando si seleziona una categoria
  useEffect(() => {
    if (selectedCategory) {
      loadTemplates(selectedCategory.id)
    } else {
      setTemplates([])
    }
  }, [selectedCategory])

  const loadCategories = async () => {
    setIsLoading(true)
    setError(null)
    try {
      let cats = await fetchCategories()
      
      // Se non ci sono categorie, inizializza quelle predefinite
      if (cats.length === 0) {
        cats = await initializeDefaultCategories()
      }
      
      setCategories(cats)
      
      // Carica i conteggi
      const counts = await countTemplatesByCategory()
      setTemplateCounts(counts)
      
      // Seleziona la prima categoria se disponibile
      if (cats.length > 0 && !selectedCategory) {
        setSelectedCategory(cats[0])
      }
    } catch (err) {
      console.error('Errore nel caricamento delle categorie:', err)
      setError('Impossibile caricare le categorie. Riprova più tardi.')
    } finally {
      setIsLoading(false)
    }
  }

  const loadTemplates = async (categoryId) => {
    try {
      const temps = await fetchTemplatesByCategory(categoryId)
      setTemplates(temps)
    } catch (err) {
      console.error('Errore nel caricamento dei template:', err)
      setError('Impossibile caricare i documenti.')
    }
  }

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return
    
    try {
      const newCat = await createCategory({
        name: newCategoryName.trim(),
        description: newCategoryDescription.trim(),
      })
      setCategories(prev => [...prev, newCat])
      setNewCategoryName('')
      setNewCategoryDescription('')
      setShowNewCategoryForm(false)
      setSelectedCategory(newCat)
    } catch (err) {
      console.error('Errore nella creazione della categoria:', err)
      setError('Impossibile creare la categoria.')
    }
  }

  const handleDeleteCategory = async (categoryId) => {
    if (!confirm('Sei sicuro di voler eliminare questa categoria e tutti i documenti associati?')) return
    
    try {
      await deleteCategory(categoryId)
      setCategories(prev => prev.filter(c => c.id !== categoryId))
      if (selectedCategory?.id === categoryId) {
        setSelectedCategory(categories.find(c => c.id !== categoryId) || null)
      }
    } catch (err) {
      console.error('Errore nell\'eliminazione della categoria:', err)
      setError('Impossibile eliminare la categoria.')
    }
  }

  const handleFileUpload = async (files) => {
    if (!selectedCategory || !files?.length) return
    
    setIsUploading(true)
    setError(null)
    setUploadProgress(0)
    
    const totalFiles = files.length
    
    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const file = files[fileIndex]
      setUploadFileName(file.name)
      
      // Calcola range di progresso per questo file (ogni file occupa una porzione del 100%)
      const fileProgressStart = (fileIndex / totalFiles) * 100
      const fileProgressEnd = ((fileIndex + 1) / totalFiles) * 100
      const fileProgressRange = fileProgressEnd - fileProgressStart
      
      const updateFileProgress = (localProgress) => {
        // Converte progresso locale (0-100) in progresso globale
        const globalProgress = fileProgressStart + (localProgress * fileProgressRange / 100)
        setUploadProgress(Math.min(100, globalProgress))
      }
      
      setUploadProgress(fileProgressStart)
      
      try {
        // Verifica che sia un PDF o Word
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
        const isWord = file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.doc') ||
                       file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                       file.type === 'application/msword'
        
        if (!isPdf && !isWord) {
          setError(`Il file "${file.name}" non è un formato supportato. Carica file PDF (.pdf) o Word (.docx, .doc).`)
          continue
        }

        // Estrai testo dal documento (PDF o Word) usando il frontend
        let transcribedContent = ''
        const fileName = file.name
        
        try {
          if (isPdf) {
            // Estrai testo dal PDF (10-40% del progresso file)
            const extraction = await extractTextFromPDF(file, (progress) => {
              // Progresso estrazione: 10-40% del range file
              updateFileProgress(10 + (progress * 0.30))
            })
            
            // Se il PDF è scansionato, usa Gemini Vision OCR
            if (extraction.isScanned || extraction.avgCharsPerPage < 50) {
              if (!isGeminiVisionAvailable()) {
                throw new Error('Il PDF sembra essere scansionato. Configura la chiave API Gemini per abilitare OCR.')
              }
              
              updateFileProgress(40)
              const { images } = await convertPDFToImages(file, { scale: 1.5, maxPages: 50 })
              
              updateFileProgress(50)
              transcribedContent = await performOCRWithGemini({
                images,
                mimeType: 'image/jpeg',
                fileName,
              })
              updateFileProgress(70)
            } else {
              // PDF nativo, pulisci e formatta con AI (40-70% del progresso file)
              updateFileProgress(40)
              transcribedContent = await transcribeWithFallback({
                text: extraction.text,
                fileName,
                apiKey: OPENAI_API_KEY,
              })
              updateFileProgress(70)
            }
            // Analizza formattazione dal testo trascritto (solo primo file per categoria)
            if (fileIndex === 0 && transcribedContent) {
              analyzeDocumentFormatting({ text: transcribedContent, apiKey: OPENAI_API_KEY })
                .then(styles => {
                  if (styles) {
                    updateCategoryFormattingStyles(selectedCategory.id, styles)
                      .then(() => console.log('📐 Stili formattazione PDF salvati per categoria'))
                      .catch(err => console.warn('Errore salvataggio stili:', err.message))
                  }
                })
                .catch(err => console.warn('Analisi formattazione non bloccante:', err.message))
            }
          } else if (isWord) {
            // Estrai testo dal Word (10-50% del progresso file)
            updateFileProgress(10)
            const extraction = await extractTextFromWord(file, (progress) => {
              updateFileProgress(10 + (progress * 0.40))
            })
            
            updateFileProgress(50)
            transcribedContent = await transcribeWithFallback({
              text: extraction.text,
              fileName,
              apiKey: OPENAI_API_KEY,
            })
            updateFileProgress(65)
            
            // Estrai stili dal Word (65-70%)
            try {
              const extractedStyles = await extractStylesFromWord(file)
              if (extractedStyles && extractedStyles.fontFamily) {
                updateCategoryFormattingStyles(selectedCategory.id, extractedStyles)
                  .then(() => console.log('📐 Stili formattazione Word salvati per categoria'))
                  .catch(err => console.warn('Errore salvataggio stili:', err.message))
              }
            } catch (styleError) {
              console.warn('Impossibile estrarre stili (non bloccante):', styleError.message)
            }
            updateFileProgress(70)
          }
        } catch (extractError) {
          console.error('Errore estrazione documento:', extractError)
          throw new Error(`Impossibile elaborare "${fileName}": ${extractError.message}`)
        }

        // Controlla limiti template prima di salvare
        const currentCategoryCount = templateCounts[selectedCategory.id] || 0
        const totalTemplatesCount = templates.length

        // Controlla limite per categoria
        if (currentCategoryCount >= MAX_TEMPLATES_PER_CATEGORY) {
          throw new Error(
            `⚠️ Limite categoria raggiunto: Hai raggiunto il limite di ${MAX_TEMPLATES_PER_CATEGORY} template per la categoria "${selectedCategory.name}". Elimina alcuni template prima di aggiungerne altri.`
          )
        }

        // Controlla limite totale
        if (totalTemplatesCount >= MAX_TOTAL_TEMPLATES) {
          throw new Error(
            `⚠️ Limite totale template raggiunto: Hai raggiunto il limite di ${MAX_TOTAL_TEMPLATES} template totali. Elimina alcuni template prima di aggiungerne altri.`
          )
        }

        // Avviso quando si avvicina al limite
        if (currentCategoryCount >= MAX_TEMPLATES_PER_CATEGORY * WARNING_TEMPLATES_THRESHOLD) {
          const remaining = MAX_TEMPLATES_PER_CATEGORY - currentCategoryCount
          console.warn(
            `⚠️ Attenzione: Hai ${currentCategoryCount} template nella categoria "${selectedCategory.name}". Ti rimangono ${remaining} template disponibili per questa categoria.`
          )
        }

        if (totalTemplatesCount >= MAX_TOTAL_TEMPLATES * WARNING_TEMPLATES_THRESHOLD) {
          const remaining = MAX_TOTAL_TEMPLATES - totalTemplatesCount
          console.warn(
            `⚠️ Attenzione: Hai ${totalTemplatesCount} template totali. Ti rimangono ${remaining} template disponibili.`
          )
        }

        // Progresso: salvataggio (70-95% del progresso file)
        updateFileProgress(70)
        
        // Salva il template nel database
        const newTemplate = await createTemplate({
          categoryId: selectedCategory.id,
          categoryName: selectedCategory.name, // Passa il nome per rigenerare il prompt
          fileName: file.name,
          fileSize: file.size,
          originalContent: transcribedContent,
          styleAnalysis: '', // Verrà popolato successivamente se necessario
          metadata: {
            uploadedAt: new Date().toISOString(),
            mimeType: file.type,
          },
          apiKey: OPENAI_API_KEY, // Passa la chiave API per generare l'embedding e il prompt
        })

        updateFileProgress(95)
        
        setTemplates(prev => [newTemplate, ...prev])
        setTemplateCounts(prev => ({
          ...prev,
          [selectedCategory.id]: (prev[selectedCategory.id] || 0) + 1,
        }))
        
        // Progresso: completato per questo file
        updateFileProgress(100)
      } catch (err) {
        console.error('Errore nell\'upload del file:', err)
        setError(`Errore nel caricamento di "${file.name}": ${err.message}`)
        // Continua con il prossimo file anche se questo fallisce
      }
    }
    
    setIsUploading(false)
    setUploadProgress(0)
    setUploadFileName('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDeleteTemplate = async (templateId) => {
    if (!confirm('Sei sicuro di voler eliminare questo documento?')) return
    
    try {
      await deleteTemplate(templateId)
      setTemplates(prev => prev.filter(t => t.id !== templateId))
      if (selectedCategory) {
        setTemplateCounts(prev => ({
          ...prev,
          [selectedCategory.id]: Math.max(0, (prev[selectedCategory.id] || 1) - 1),
        }))
      }
    } catch (err) {
      console.error('Errore nell\'eliminazione del template:', err)
      setError('Impossibile eliminare il documento.')
    }
  }

  const handleDrop = (event) => {
    event.preventDefault()
    const files = Array.from(event.dataTransfer.files)
    handleFileUpload(files)
  }

  const handleDragOver = (event) => {
    event.preventDefault()
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3 text-white">
          <span className="inline-flex h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          <p className="text-sm">Caricamento documenti template...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-slate-900/40 backdrop-blur-sm">
      {/* Barra di caricamento overlay quando si sta caricando un documento */}
      {isUploading && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-2xl">
            <div className="mb-6 text-center">
              <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#7B1F34]/10 to-[#9E3A50]/10">
                <svg className="h-8 w-8 animate-spin text-[#7B1F34]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Caricamento documento</h3>
              {uploadFileName && (
                <p className="mt-2 text-sm text-slate-600">{uploadFileName}</p>
              )}
            </div>
            
            {/* Barra di progresso */}
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between text-xs text-slate-600">
                <span>Elaborazione in corso...</span>
                <span className="font-semibold">{Math.round(uploadProgress)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#7B1F34] to-[#9E3A50] transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
            
            <p className="text-center text-xs text-slate-500">
              Estrazione testo, pulizia e salvataggio in corso...
            </p>
          </div>
        </div>
      )}
      
      <div className="m-4 flex flex-1 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_40px_120px_rgba(15,23,42,0.25)]">
        {/* Sidebar categorie */}
        <div className="w-80 flex-shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 flex-shrink-0">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Documenti Template</h2>
              <p className="text-xs text-slate-500">Emula i tuoi pareri</p>
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
          
          <div className="flex-1 overflow-y-auto p-3 min-h-0 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent hover:scrollbar-thumb-slate-400">
            <div className="mb-3 flex items-center justify-between px-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Categorie</span>
              <button
                type="button"
                onClick={() => setShowNewCategoryForm(true)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-[#8C2B42] hover:bg-[#f0f7f9] hover:text-[#7B1F34]"
                title="Nuova categoria"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
                </svg>
              </button>
            </div>
            
            {showNewCategoryForm && (
              <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Nome categoria"
                  className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#8C2B42]"
                />
                <input
                  type="text"
                  value={newCategoryDescription}
                  onChange={(e) => setNewCategoryDescription(e.target.value)}
                  placeholder="Descrizione (opzionale)"
                  className="mb-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#8C2B42]"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCreateCategory}
                    className="flex-1 rounded-xl bg-[#8C2B42] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#3d9fae]"
                  >
                    Crea
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewCategoryForm(false)
                      setNewCategoryName('')
                      setNewCategoryDescription('')
                    }}
                    className="flex-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                  >
                    Annulla
                  </button>
                </div>
              </div>
            )}
            
            <div className="space-y-1">
              {categories.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white/50 p-4 text-center">
                  <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 text-slate-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                    </svg>
                  </div>
                  <p className="text-xs text-slate-500 mb-2">Nessuna categoria</p>
                  <p className="text-[10px] text-slate-400">Clicca + per creare la tua prima categoria</p>
                </div>
              ) : (
                categories.map((category) => {
                  const isActive = selectedCategory?.id === category.id
                  const count = templateCounts[category.id] || 0
                  const IconComponent = CATEGORY_ICONS[category.icon] || CATEGORY_ICONS.document
                  
                  return (
                    <div
                      key={category.id}
                      className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition cursor-pointer ${
                        isActive
                          ? 'bg-white shadow-sm border border-slate-200'
                          : 'hover:bg-white/60'
                      }`}
                      onClick={() => setSelectedCategory(category)}
                    >
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${category.color}20`, color: category.color }}
                      >
                        {IconComponent}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-700">{category.name}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-slate-400">{count} documenti</p>
                          {category.custom_prompt && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600" title="Prompt stile generato">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-2.5 w-2.5">
                                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                              </svg>
                              Stile
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteCategory(category.id)
                        }}
                        className="opacity-0 group-hover:opacity-100 inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                        title="Elimina categoria"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12m-1 0l-.867 12.142A2 2 0 0114.138 21H9.862a2 2 0 01-1.995-1.858L7 7m5-3.5a1.5 1.5 0 00-3 0V7m3-3.5a1.5 1.5 0 013 0V7" />
                        </svg>
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
          
          <div className="border-t border-slate-200 p-4 flex-shrink-0">
            <p className="text-xs text-slate-500 leading-relaxed">
              Carica i tuoi documenti come esempi di stile. Quando genererai nuovi documenti, il sistema emulerà il tuo modo di scrivere.
            </p>
          </div>
        </div>
        
        {/* Area principale - documenti */}
        <div className="flex flex-1 flex-col">
          {selectedCategory ? (
            <>
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">{selectedCategory.name}</h3>
                  <p className="text-sm text-slate-500">{selectedCategory.description}</p>
                </div>
                <label
                  className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#8C2B42] via-[#A5435A] to-[#B85468] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(72,209,181,0.4)] transition cursor-pointer hover:scale-105 ${
                    isUploading ? 'opacity-60 cursor-not-allowed' : ''
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  {isUploading ? 'Caricamento...' : 'Carica documento'}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,.pdf,.docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFileUpload(Array.from(e.target.files))}
                    disabled={isUploading}
                  />
                </label>
              </div>
              
              {error && (
                <div className="mx-6 mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className="ml-2 font-semibold hover:underline"
                  >
                    Chiudi
                  </button>
                </div>
              )}
              
              <div
                className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent hover:scrollbar-thumb-slate-400"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
              >
                {templates.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <div className="mb-6 rounded-full bg-slate-100 p-6">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="h-16 w-16 text-slate-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <h4 className="mb-2 text-lg font-semibold text-slate-700">Nessun documento template</h4>
                    <p className="mb-6 max-w-md text-sm text-slate-500">
                      Trascina qui i tuoi documenti PDF o Word, oppure usa il pulsante "Carica documento" per aggiungere esempi del tuo stile di scrittura.
                    </p>
                    <label className="inline-flex items-center gap-2 rounded-full border-2 border-dashed border-slate-300 px-6 py-3 text-sm font-semibold text-slate-600 transition cursor-pointer hover:border-[#8C2B42] hover:bg-[#f0f7f9] hover:text-[#7B1F34]">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Seleziona file PDF o Word
                      <input
                        type="file"
                        accept="application/pdf,.pdf,.docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                        multiple
                        className="hidden"
                        onChange={(e) => handleFileUpload(Array.from(e.target.files))}
                        disabled={isUploading}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {templates.map((template) => (
                      <div
                        key={template.id}
                        className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
                      >
                        <div className="mb-3 flex items-start justify-between">
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-500">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                              <path d="M7 18H17V16H7V18ZM7 14H17V12H7V14ZM5 22C4.45 22 3.979 21.804 3.588 21.413C3.196 21.021 3 20.55 3 20V4C3 3.45 3.196 2.979 3.588 2.588C3.979 2.196 4.45 2 5 2H14L20 8V20C20 20.55 19.804 21.021 19.413 21.413C19.021 21.804 18.55 22 18 22H5ZM13 9V4H5V20H18V9H13Z" />
                            </svg>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteTemplate(template.id)}
                            className="opacity-0 group-hover:opacity-100 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                            title="Elimina documento"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12m-1 0l-.867 12.142A2 2 0 0114.138 21H9.862a2 2 0 01-1.995-1.858L7 7m5-3.5a1.5 1.5 0 00-3 0V7m3-3.5a1.5 1.5 0 013 0V7" />
                            </svg>
                          </button>
                        </div>
                        <h5 className="mb-1 truncate text-sm font-semibold text-slate-800" title={template.file_name}>
                          {template.file_name}
                        </h5>
                        <div className="flex items-center gap-3 text-xs text-slate-400">
                          <span>{formatBytes(template.file_size)}</span>
                          <span>•</span>
                          <span>{formatDate(template.created_at)}</span>
                          {template.original_content && (
                            <>
                              <span>•</span>
                              <span className="font-semibold text-rose-800">{countWords(template.original_content)} parole</span>
                            </>
                          )}
                        </div>
                        {template.original_content && (
                          <p className="mt-3 line-clamp-3 text-xs text-slate-500">
                            {template.original_content.slice(0, 200)}...
                          </p>
                        )}
                        {!template.original_content && (
                          <p className="mt-3 text-xs text-red-500 font-medium">
                            ⚠️ ATTENZIONE: Contenuto vuoto - questo template non funzionerà per la generazione
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-center p-6">
              <div className="mb-6 rounded-full bg-slate-100 p-6">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="h-16 w-16 text-slate-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <h4 className="mb-2 text-lg font-semibold text-slate-700">Seleziona una categoria</h4>
              <p className="max-w-md text-sm text-slate-500">
                Seleziona una categoria dalla lista a sinistra per visualizzare e gestire i tuoi documenti template.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
