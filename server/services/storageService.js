/**
 * Storage Service - Cloud Ready
 * Supporta sia storage locale (sviluppo) che Supabase Storage (produzione)
 */

import { createClient } from '@supabase/supabase-js'
import { readFile, writeFile, unlink, mkdir } from 'fs/promises'
import { join, basename } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { createContextLogger } from './logger.js'

const log = createContextLogger('Storage')

const __filename = fileURLToPath(import.meta.url)
const __dirnameLocal = dirname(__filename)

// Configurazione
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const USE_CLOUD_STORAGE = process.env.USE_CLOUD_STORAGE === 'true' && SUPABASE_URL && SUPABASE_SERVICE_KEY
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'documents'

// Supabase client (solo se configurato)
let supabase = null
if (USE_CLOUD_STORAGE) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  })
  log.info('Cloud storage enabled (Supabase)')
} else {
  log.info('Using local storage')
}

/**
 * Storage locale per sviluppo
 */
class LocalStorage {
  constructor(basePath) {
    this.basePath = basePath
  }

  async upload(filePath, fileBuffer, options = {}) {
    const fullPath = join(this.basePath, filePath)
    const dir = dirname(fullPath)
    
    await mkdir(dir, { recursive: true })
    await writeFile(fullPath, fileBuffer)
    
    log.debug(`File saved locally: ${filePath}`)
    
    return {
      path: filePath,
      url: `file://${fullPath}`,
      size: fileBuffer.length
    }
  }

  async download(filePath) {
    const fullPath = join(this.basePath, filePath)
    const buffer = await readFile(fullPath)
    
    log.debug(`File read locally: ${filePath}`)
    return buffer
  }

  async delete(filePath) {
    const fullPath = join(this.basePath, filePath)
    await unlink(fullPath)
    
    log.debug(`File deleted locally: ${filePath}`)
    return true
  }

  async exists(filePath) {
    try {
      const fullPath = join(this.basePath, filePath)
      await readFile(fullPath)
      return true
    } catch {
      return false
    }
  }

  getPublicUrl(filePath) {
    return `file://${join(this.basePath, filePath)}`
  }
}

/**
 * Supabase Storage per produzione
 */
class SupabaseStorage {
  constructor(bucket) {
    this.bucket = bucket
    this.initPromise = this.ensureBucketExists()
  }

  async ensureBucketExists() {
    try {
      const { data: buckets } = await supabase.storage.listBuckets()
      const exists = buckets?.some(b => b.name === this.bucket)
      
      if (!exists) {
        const { error } = await supabase.storage.createBucket(this.bucket, {
          public: false,
          fileSizeLimit: 52428800 // 50MB
        })
        if (error && !error.message.includes('already exists')) {
          throw error
        }
        log.info(`Storage bucket created: ${this.bucket}`)
      }
    } catch (error) {
      log.warn('Could not verify bucket exists', { error: error.message })
    }
  }

  async upload(filePath, fileBuffer, options = {}) {
    await this.initPromise
    
    const { contentType = 'application/octet-stream' } = options
    
    const { data, error } = await supabase.storage
      .from(this.bucket)
      .upload(filePath, fileBuffer, {
        contentType,
        upsert: true
      })
    
    if (error) {
      log.error('Upload failed', { path: filePath, error: error.message })
      throw error
    }
    
    log.info(`File uploaded to cloud: ${filePath}`)
    
    return {
      path: data.path,
      url: this.getPublicUrl(data.path),
      size: fileBuffer.length
    }
  }

  async download(filePath) {
    await this.initPromise
    
    const { data, error } = await supabase.storage
      .from(this.bucket)
      .download(filePath)
    
    if (error) {
      log.error('Download failed', { path: filePath, error: error.message })
      throw error
    }
    
    log.debug(`File downloaded from cloud: ${filePath}`)
    return Buffer.from(await data.arrayBuffer())
  }

  async delete(filePath) {
    await this.initPromise
    
    const { error } = await supabase.storage
      .from(this.bucket)
      .remove([filePath])
    
    if (error) {
      log.error('Delete failed', { path: filePath, error: error.message })
      throw error
    }
    
    log.debug(`File deleted from cloud: ${filePath}`)
    return true
  }

  async exists(filePath) {
    await this.initPromise
    
    const { data, error } = await supabase.storage
      .from(this.bucket)
      .list(dirname(filePath), {
        search: basename(filePath)
      })
    
    return !error && data?.length > 0
  }

  getPublicUrl(filePath) {
    const { data } = supabase.storage
      .from(this.bucket)
      .getPublicUrl(filePath)
    
    return data?.publicUrl
  }

  async getSignedUrl(filePath, expiresIn = 3600) {
    await this.initPromise
    
    const { data, error } = await supabase.storage
      .from(this.bucket)
      .createSignedUrl(filePath, expiresIn)
    
    if (error) throw error
    return data.signedUrl
  }
}

// Singleton storage instance
let storageInstance = null

export function getStorage() {
  if (!storageInstance) {
    if (USE_CLOUD_STORAGE) {
      storageInstance = new SupabaseStorage(STORAGE_BUCKET)
    } else {
      storageInstance = new LocalStorage(join(__dirnameLocal, '..', 'uploads'))
    }
  }
  return storageInstance
}

/**
 * Helper per generare path organizzati
 */
export function generateStoragePath(userId, fileName, type = 'documents') {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const timestamp = Date.now()
  const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_')
  
  return `${type}/${userId}/${year}/${month}/${timestamp}-${safeName}`
}

/**
 * Helper per ottenere content type
 */
export function getContentType(fileName) {
  const ext = fileName.split('.').pop().toLowerCase()
  const types = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp'
  }
  return types[ext] || 'application/octet-stream'
}

export default { getStorage, generateStoragePath, getContentType }
