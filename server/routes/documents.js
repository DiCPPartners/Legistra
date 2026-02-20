/**
 * Document API Routes - Production Ready
 * Gestisce upload e elaborazione documenti con validazione
 */

import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { processDocument } from '../services/documentProcessor.js'
import { validateUserId, validateFileBatch, sanitizeFileName } from '../services/validation.js'
import { createContextLogger } from '../services/logger.js'

const log = createContextLogger('DocumentRoutes')
const router = Router()

// Store per tracking jobs attivi (in produzione usare Redis)
const activeJobs = new Map()

// Cleanup automatico job vecchi (ogni 10 minuti)
setInterval(() => {
  const maxAge = 60 * 60 * 1000 // 1 ora
  const now = Date.now()
  
  for (const [batchId, batch] of activeJobs.entries()) {
    if (now - batch.createdAt.getTime() > maxAge) {
      activeJobs.delete(batchId)
      log.debug('Cleaned up old batch', { batchId })
    }
  }
}, 10 * 60 * 1000)

/**
 * POST /api/documents/upload
 * Upload multiplo di documenti per elaborazione
 */
router.post('/upload', (req, res, next) => {
  const upload = req.app.get('upload')
  upload.array('files', 20)(req, res, (err) => {
    if (err) {
      log.warn('Upload middleware error', { error: err.message })
      return res.status(400).json({ error: err.message })
    }
    next()
  })
}, async (req, res) => {
  try {
    const files = req.files
    const { conversationId, userId } = req.body
    const io = req.app.get('io')
    
    // Validazione userId
    const userValidation = validateUserId(userId)
    if (!userValidation.valid) {
      log.warn('Invalid userId in upload', { error: userValidation.error })
      return res.status(401).json({ error: userValidation.error })
    }
    
    // Validazione file
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'Nessun file caricato' })
    }
    
    const fileValidation = validateFileBatch(files)
    if (!fileValidation.valid) {
      log.warn('File validation failed', { errors: fileValidation.errors })
      return res.status(400).json({ 
        error: 'Alcuni file non sono validi',
        details: fileValidation.errors
      })
    }
    
    // Log upload
    log.info('Document upload started', {
      userId: userValidation.userId,
      fileCount: fileValidation.validFiles.length,
      skipped: fileValidation.skipped
    })

    // Crea batch ID per questo gruppo di documenti
    const batchId = uuidv4()
    
    // Prepara risposta immediata
    const jobs = fileValidation.validFiles.map(file => ({
      id: uuidv4(),
      fileName: sanitizeFileName(file.originalname),
      filePath: file.path,
      size: file.size,
      status: 'queued',
      progress: 0
    }))

    // Salva jobs
    activeJobs.set(batchId, {
      id: batchId,
      conversationId,
      userId: userValidation.userId,
      jobs,
      createdAt: new Date(),
      status: 'processing'
    })

    // Risposta immediata - il client può andare dove vuole
    res.json({
      success: true,
      batchId,
      message: `${jobs.length} file in elaborazione`,
      jobs: jobs.map(j => ({ id: j.id, fileName: j.fileName, status: j.status })),
      skipped: fileValidation.skipped,
      warnings: fileValidation.errors.length > 0 ? fileValidation.errors : undefined
    })

    // Elabora in background (dopo aver risposto)
    setImmediate(async () => {
      await processDocumentBatch(batchId, jobs, io, conversationId, userValidation.userId)
    })

  } catch (error) {
    log.error('Upload error', { error: error.message, stack: error.stack })
    res.status(500).json({ error: 'Errore durante upload' })
  }
})

/**
 * GET /api/documents/status/:batchId
 * Controlla stato elaborazione batch
 */
router.get('/status/:batchId', (req, res) => {
  const { batchId } = req.params
  const batch = activeJobs.get(batchId)
  
  if (!batch) {
    return res.status(404).json({ error: 'Batch non trovato' })
  }
  
  res.json(batch)
})

/**
 * POST /api/documents/cancel/:batchId
 * Annulla elaborazione batch
 */
router.post('/cancel/:batchId', (req, res) => {
  const { batchId } = req.params
  const batch = activeJobs.get(batchId)
  
  if (!batch) {
    return res.status(404).json({ error: 'Batch non trovato' })
  }
  
  batch.status = 'cancelled'
  batch.jobs.forEach(job => {
    if (job.status === 'queued' || job.status === 'processing') {
      job.status = 'cancelled'
    }
  })
  
  res.json({ success: true, message: 'Elaborazione annullata' })
})

/**
 * Elabora batch di documenti in background
 */
async function processDocumentBatch(batchId, jobs, io, conversationId, userId) {
  const batch = activeJobs.get(batchId)
  if (!batch) return

  const socketRoom = `user:${userId}`
  
  // Notifica inizio elaborazione
  io.to(socketRoom).emit('batch:start', {
    batchId,
    totalFiles: jobs.length
  })

  const results = []
  
  // Elabora file in parallelo (max 4 alla volta)
  const PARALLEL = 4
  for (let i = 0; i < jobs.length; i += PARALLEL) {
    const chunk = jobs.slice(i, i + PARALLEL)
    
    const chunkResults = await Promise.all(
      chunk.map(async (job) => {
        if (batch.status === 'cancelled') {
          return { ...job, status: 'cancelled' }
        }

        job.status = 'processing'
        log.info('Emitting job:progress', { socketRoom, fileName: job.fileName, progress: 10 })
        io.to(socketRoom).emit('job:progress', {
          batchId,
          jobId: job.id,
          fileName: job.fileName,
          status: 'processing',
          progress: 10,
          message: 'Analisi documento in corso...'
        })

        try {
          const result = await processDocument(job, (progress, message) => {
            job.progress = progress
            io.to(socketRoom).emit('job:progress', {
              batchId,
              jobId: job.id,
              fileName: job.fileName,
              status: 'processing',
              progress,
              message
            })
          })

          job.status = 'completed'
          job.result = result
          job.progress = 100

          io.to(socketRoom).emit('job:complete', {
            batchId,
            jobId: job.id,
            fileName: job.fileName,
            result
          })

          return job

        } catch (error) {
          console.error(`Error processing ${job.fileName}:`, error)
          job.status = 'error'
          job.error = error.message

          io.to(socketRoom).emit('job:error', {
            batchId,
            jobId: job.id,
            fileName: job.fileName,
            error: error.message
          })

          return job
        }
      })
    )

    results.push(...chunkResults)
  }

  // Batch completato
  batch.status = 'completed'
  batch.completedAt = new Date()
  
  const successCount = results.filter(j => j.status === 'completed').length
  const combinedText = results
    .filter(j => j.status === 'completed' && j.result?.text)
    .map((j, i) => `DOCUMENTO ${i + 1}: ${j.fileName}\n${'='.repeat(50)}\n\n${j.result.text}`)
    .join('\n\n' + '─'.repeat(60) + '\n\n')

  io.to(socketRoom).emit('batch:complete', {
    batchId,
    conversationId,
    totalFiles: jobs.length,
    successCount,
    combinedText,
    results: results.map(j => ({
      id: j.id,
      fileName: j.fileName,
      status: j.status,
      text: j.result?.text?.substring(0, 500) + '...',
      error: j.error
    }))
  })

  // Pulisci dopo 1 ora
  setTimeout(() => {
    activeJobs.delete(batchId)
  }, 60 * 60 * 1000)
}

export default router
