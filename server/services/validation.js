/**
 * Validation & Sanitization Service
 * Protezione input per sicurezza produzione
 */

import { createContextLogger } from './logger.js'

const log = createContextLogger('Validation')

/**
 * Sanitizza stringa rimuovendo caratteri pericolosi
 */
export function sanitizeString(input, maxLength = 1000) {
  if (typeof input !== 'string') return ''
  
  return input
    .slice(0, maxLength)
    .replace(/[<>]/g, '') // Previene XSS base
    .replace(/[\x00-\x1F\x7F]/g, '') // Rimuove caratteri di controllo
    .trim()
}

/**
 * Sanitizza nome file
 */
export function sanitizeFileName(fileName) {
  if (typeof fileName !== 'string') return 'unnamed'
  
  return fileName
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') // Caratteri non validi
    .replace(/\.{2,}/g, '.') // Previene path traversal
    .replace(/^[.\s]+|[.\s]+$/g, '') // Trim punti e spazi
    .slice(0, 255) // Limite lunghezza
    || 'unnamed'
}

/**
 * Valida UUID
 */
export function isValidUUID(str) {
  if (typeof str !== 'string') return false
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

/**
 * Valida e sanitizza userId
 */
export function validateUserId(userId) {
  if (!userId) {
    return { valid: false, error: 'userId richiesto' }
  }
  
  if (!isValidUUID(userId)) {
    log.warn('Invalid userId format', { userId: String(userId).slice(0, 50) })
    return { valid: false, error: 'Formato userId non valido' }
  }
  
  return { valid: true, userId }
}

/**
 * Valida file upload
 */
export function validateUploadedFile(file) {
  const errors = []
  
  if (!file) {
    return { valid: false, errors: ['File mancante'] }
  }
  
  // Verifica dimensione (50MB max)
  const maxSize = 50 * 1024 * 1024
  if (file.size > maxSize) {
    errors.push(`File troppo grande: ${(file.size / 1024 / 1024).toFixed(2)}MB (max 50MB)`)
  }
  
  // Verifica tipo MIME
  const allowedMimes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
  
  if (!allowedMimes.includes(file.mimetype)) {
    errors.push(`Tipo file non supportato: ${file.mimetype}`)
  }
  
  // Verifica estensione
  const allowedExtensions = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.webp']
  const ext = '.' + (file.originalname?.split('.').pop()?.toLowerCase() || '')
  
  if (!allowedExtensions.includes(ext)) {
    errors.push(`Estensione file non supportata: ${ext}`)
  }
  
  // Verifica nome file sospetto
  if (file.originalname?.includes('..') || file.originalname?.includes('/')) {
    errors.push('Nome file non valido')
  }
  
  return {
    valid: errors.length === 0,
    errors,
    sanitizedName: sanitizeFileName(file.originalname)
  }
}

/**
 * Valida batch di file
 */
export function validateFileBatch(files, maxFiles = 20) {
  if (!Array.isArray(files) || files.length === 0) {
    return { valid: false, errors: ['Nessun file fornito'] }
  }
  
  if (files.length > maxFiles) {
    return { valid: false, errors: [`Troppi file: ${files.length} (max ${maxFiles})`] }
  }
  
  const allErrors = []
  const validFiles = []
  
  for (const file of files) {
    const result = validateUploadedFile(file)
    if (result.valid) {
      validFiles.push({
        ...file,
        sanitizedName: result.sanitizedName
      })
    } else {
      allErrors.push(...result.errors.map(e => `${file.originalname}: ${e}`))
    }
  }
  
  return {
    valid: validFiles.length > 0,
    validFiles,
    errors: allErrors,
    skipped: files.length - validFiles.length
  }
}

/**
 * Valida richiesta API
 */
export function validateAPIRequest(body, requiredFields = []) {
  const errors = []
  const sanitized = {}
  
  for (const field of requiredFields) {
    if (!(field in body) || body[field] === undefined || body[field] === '') {
      errors.push(`Campo richiesto mancante: ${field}`)
    }
  }
  
  // Sanitizza tutti i campi stringa
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value)
    } else if (typeof value === 'number') {
      sanitized[key] = isFinite(value) ? value : 0
    } else if (typeof value === 'boolean') {
      sanitized[key] = value
    } else if (Array.isArray(value)) {
      sanitized[key] = value.slice(0, 100) // Limita array size
    } else {
      sanitized[key] = value
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    sanitized
  }
}

/**
 * Rate limit check per utente (in-memory, per produzione usa Redis)
 */
const userRequestCounts = new Map()
const RATE_LIMIT_WINDOW = 60000 // 1 minuto
const MAX_REQUESTS_PER_MINUTE = 60

export function checkUserRateLimit(userId) {
  const now = Date.now()
  const key = `${userId}`
  
  // Pulisci vecchi record
  if (userRequestCounts.size > 10000) {
    for (const [k, v] of userRequestCounts.entries()) {
      if (now - v.timestamp > RATE_LIMIT_WINDOW) {
        userRequestCounts.delete(k)
      }
    }
  }
  
  const record = userRequestCounts.get(key)
  
  if (!record || now - record.timestamp > RATE_LIMIT_WINDOW) {
    userRequestCounts.set(key, { count: 1, timestamp: now })
    return { allowed: true, remaining: MAX_REQUESTS_PER_MINUTE - 1 }
  }
  
  if (record.count >= MAX_REQUESTS_PER_MINUTE) {
    const resetIn = Math.ceil((record.timestamp + RATE_LIMIT_WINDOW - now) / 1000)
    log.warn('User rate limited', { userId, resetIn })
    return { allowed: false, remaining: 0, resetIn }
  }
  
  record.count++
  return { allowed: true, remaining: MAX_REQUESTS_PER_MINUTE - record.count }
}

/**
 * Middleware Express per validazione
 */
export function validationMiddleware(requiredFields = []) {
  return (req, res, next) => {
    // Valida userId
    const userId = req.headers['x-user-id'] || req.body?.userId
    const userValidation = validateUserId(userId)
    
    if (!userValidation.valid) {
      return res.status(401).json({ error: userValidation.error })
    }
    
    req.validatedUserId = userValidation.userId
    
    // Valida body se ci sono campi richiesti
    if (requiredFields.length > 0) {
      const bodyValidation = validateAPIRequest(req.body, requiredFields)
      if (!bodyValidation.valid) {
        return res.status(400).json({ errors: bodyValidation.errors })
      }
      req.sanitizedBody = bodyValidation.sanitized
    }
    
    // Check rate limit per utente
    const rateLimit = checkUserRateLimit(userValidation.userId)
    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: 'Limite richieste raggiunto',
        resetIn: rateLimit.resetIn
      })
    }
    
    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining)
    
    next()
  }
}

export default {
  sanitizeString,
  sanitizeFileName,
  isValidUUID,
  validateUserId,
  validateUploadedFile,
  validateFileBatch,
  validateAPIRequest,
  checkUserRateLimit,
  validationMiddleware
}
