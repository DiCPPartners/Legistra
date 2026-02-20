/**
 * Job Queue Service
 * Gestisce elaborazione asincrona con supporto per:
 * - Redis/BullMQ (produzione scalabile)
 * - In-memory (sviluppo locale)
 */

import { EventEmitter } from 'events'
import logger, { createContextLogger } from './logger.js'

const log = createContextLogger('JobQueue')

// Configurazione
const REDIS_URL = process.env.REDIS_URL
const USE_REDIS = !!REDIS_URL

// Job status
export const JobStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
}

/**
 * In-Memory Queue per sviluppo locale
 * Simula il comportamento di BullMQ senza Redis
 */
class InMemoryQueue extends EventEmitter {
  constructor(name, options = {}) {
    super()
    this.name = name
    this.jobs = new Map()
    this.processing = new Set()
    this.concurrency = options.concurrency || 3
    this.processor = null
    this.isProcessing = false
  }

  async add(jobName, data, options = {}) {
    const jobId = options.jobId || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const job = {
      id: jobId,
      name: jobName,
      data,
      status: JobStatus.PENDING,
      progress: 0,
      createdAt: new Date(),
      attempts: 0,
      maxAttempts: options.attempts || 3
    }
    
    this.jobs.set(jobId, job)
    log.debug(`Job added: ${jobId}`, { jobName, dataKeys: Object.keys(data) })
    
    // Avvia processing se non già attivo
    this.processNext()
    
    return job
  }

  process(processor) {
    this.processor = processor
    this.processNext()
  }

  async processNext() {
    if (this.isProcessing) return
    if (this.processing.size >= this.concurrency) return
    if (!this.processor) return

    // Trova prossimo job pending
    const pendingJob = Array.from(this.jobs.values())
      .find(j => j.status === JobStatus.PENDING)
    
    if (!pendingJob) return

    this.isProcessing = true
    pendingJob.status = JobStatus.PROCESSING
    this.processing.add(pendingJob.id)

    // Crea oggetto job con metodi helper
    const jobWrapper = {
      id: pendingJob.id,
      name: pendingJob.name,
      data: pendingJob.data,
      updateProgress: async (progress) => {
        pendingJob.progress = progress
        this.emit('progress', pendingJob, progress)
      },
      log: (message) => {
        log.debug(`[Job ${pendingJob.id}] ${message}`)
      }
    }

    try {
      const result = await this.processor(jobWrapper)
      pendingJob.status = JobStatus.COMPLETED
      pendingJob.result = result
      pendingJob.completedAt = new Date()
      this.emit('completed', pendingJob, result)
      log.info(`Job completed: ${pendingJob.id}`)
    } catch (error) {
      pendingJob.attempts++
      
      if (pendingJob.attempts < pendingJob.maxAttempts) {
        pendingJob.status = JobStatus.PENDING
        log.warn(`Job failed, retrying: ${pendingJob.id}`, { attempt: pendingJob.attempts, error: error.message })
      } else {
        pendingJob.status = JobStatus.FAILED
        pendingJob.error = error.message
        pendingJob.failedAt = new Date()
        this.emit('failed', pendingJob, error)
        log.error(`Job failed permanently: ${pendingJob.id}`, { error: error.message })
      }
    } finally {
      this.processing.delete(pendingJob.id)
      this.isProcessing = false
      
      // Processa prossimo job
      setImmediate(() => this.processNext())
    }
  }

  async getJob(jobId) {
    return this.jobs.get(jobId)
  }

  async getJobs(statuses = []) {
    const jobs = Array.from(this.jobs.values())
    if (statuses.length === 0) return jobs
    return jobs.filter(j => statuses.includes(j.status))
  }

  async obliterate() {
    this.jobs.clear()
    this.processing.clear()
  }

  async close() {
    // Cleanup
    this.processor = null
  }
}

/**
 * Redis Queue wrapper per BullMQ
 */
class RedisQueue extends EventEmitter {
  constructor(name, options = {}) {
    super()
    this.name = name
    this.queue = null
    this.worker = null
    this.options = options
    this.initialized = false
  }

  async init() {
    if (this.initialized) return

    const { Queue, Worker } = await import('bullmq')
    const IORedis = (await import('ioredis')).default

    const connection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    })

    this.queue = new Queue(this.name, { connection })
    log.info(`Redis queue initialized: ${this.name}`)
    this.initialized = true
  }

  async add(jobName, data, options = {}) {
    await this.init()
    const job = await this.queue.add(jobName, data, {
      attempts: options.attempts || 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { age: 3600 }, // 1 ora
      removeOnFail: { age: 86400 }, // 24 ore
      ...options
    })
    log.debug(`Redis job added: ${job.id}`, { jobName })
    return job
  }

  process(processor) {
    this.init().then(async () => {
      const { Worker } = await import('bullmq')
      const IORedis = (await import('ioredis')).default

      const connection = new IORedis(REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false
      })

      this.worker = new Worker(this.name, processor, {
        connection,
        concurrency: this.options.concurrency || 3
      })

      this.worker.on('completed', (job, result) => {
        this.emit('completed', job, result)
        log.info(`Redis job completed: ${job.id}`)
      })

      this.worker.on('failed', (job, error) => {
        this.emit('failed', job, error)
        log.error(`Redis job failed: ${job.id}`, { error: error.message })
      })

      this.worker.on('progress', (job, progress) => {
        this.emit('progress', job, progress)
      })

      log.info(`Redis worker started: ${this.name}`)
    })
  }

  async getJob(jobId) {
    await this.init()
    return this.queue.getJob(jobId)
  }

  async getJobs(statuses = ['active', 'waiting', 'completed', 'failed']) {
    await this.init()
    return this.queue.getJobs(statuses)
  }

  async obliterate() {
    await this.init()
    await this.queue.obliterate()
  }

  async close() {
    if (this.worker) await this.worker.close()
    if (this.queue) await this.queue.close()
  }
}

/**
 * Factory per creare la queue appropriata
 */
export function createQueue(name, options = {}) {
  if (USE_REDIS) {
    log.info(`Creating Redis queue: ${name}`)
    return new RedisQueue(name, options)
  } else {
    log.info(`Creating in-memory queue: ${name}`)
    return new InMemoryQueue(name, options)
  }
}

// Singleton queues
let documentQueue = null
let ocrQueue = null

export function getDocumentQueue() {
  if (!documentQueue) {
    documentQueue = createQueue('document-processing', { concurrency: 3 })
  }
  return documentQueue
}

export function getOCRQueue() {
  if (!ocrQueue) {
    ocrQueue = createQueue('ocr-processing', { concurrency: 5 })
  }
  return ocrQueue
}

// Cleanup su shutdown
process.on('SIGTERM', async () => {
  log.info('Shutting down queues...')
  if (documentQueue) await documentQueue.close()
  if (ocrQueue) await ocrQueue.close()
})

export default { createQueue, getDocumentQueue, getOCRQueue, JobStatus }
