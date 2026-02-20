/**
 * myMD Backend Server - Production Ready
 * Gestisce elaborazione documenti in background con WebSocket real-time
 */

// IMPORTANTE: Carica dotenv PRIMA di tutto
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirnameLocal = dirname(__filename)

// Carica .env in base all'ambiente
const envFile = process.env.NODE_ENV === 'production' 
  ? '.env.production' 
  : '../chat-app/.env'
dotenv.config({ path: join(__dirnameLocal, envFile) })

// Ora importa il resto
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import multer from 'multer'
import { mkdir } from 'fs/promises'

// Services
import logger, { createContextLogger } from './services/logger.js'
const log = createContextLogger('Server')

// Routes (DOPO dotenv)
const documentRoutes = (await import('./routes/documents.js')).default
const { initSocketHandlers } = await import('./services/socketHandler.js')

// Configurazione
const PORT = process.env.PORT || 3001
const NODE_ENV = process.env.NODE_ENV || 'development'
const isProduction = NODE_ENV === 'production'

// CORS origins - configurabile per produzione
const CORS_ORIGINS = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173']

// Crea cartelle necessarie
await mkdir(join(__dirnameLocal, 'uploads'), { recursive: true })
await mkdir(join(__dirnameLocal, 'processed'), { recursive: true })
await mkdir(join(__dirnameLocal, 'logs'), { recursive: true })

// Express app
const app = express()
const httpServer = createServer(app)

// Trust proxy (necessario per rate limiting dietro reverse proxy)
app.set('trust proxy', 1)

// ============================================
// MIDDLEWARE DI SICUREZZA
// ============================================

// Helmet - Headers di sicurezza HTTP
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false, // Necessario per alcuni browser
  contentSecurityPolicy: isProduction ? undefined : false
}))

// Compression - Gzip per risposte
app.use(compression())

// CORS
app.use(cors({
  origin: CORS_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id']
}))

// Rate Limiting - Protezione da abuse
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: isProduction ? 100 : 1000, // Limite richieste per IP
  message: { error: 'Troppe richieste, riprova tra qualche minuto' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health' // Health check escluso
})

// Rate limiting più stretto per upload (operazioni costose)
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: isProduction ? 10 : 100, // Max 10 upload al minuto in produzione
  message: { error: 'Limite upload raggiunto, attendi un minuto' }
})

app.use('/api/', apiLimiter)
app.use('/api/documents/upload', uploadLimiter)

// Body parsing con limiti
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Request logging
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    if (req.path !== '/api/health') {
      log.info(`${req.method} ${req.path}`, {
        status: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip
      })
    }
  })
  next()
})

// ============================================
// SOCKET.IO
// ============================================

const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  // Limiti per sicurezza
  maxHttpBufferSize: 1e7 // 10MB max per messaggio
})

// ============================================
// STORAGE PER UPLOAD
// ============================================

const storage = multer.diskStorage({
  destination: join(__dirnameLocal, 'uploads'),
  filename: (req, file, cb) => {
    // Sanitizza nome file
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_')
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + '-' + safeName)
  }
})

// Filtro file - solo formati supportati
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error(`Tipo file non supportato: ${file.mimetype}`), false)
  }
}

const upload = multer({ 
  storage,
  fileFilter,
  limits: { 
    fileSize: 50 * 1024 * 1024, // 50MB max per file
    files: 20 // Max 20 file per richiesta
  }
})

// Rendi disponibili alle routes
app.set('upload', upload)
app.set('io', io)

// ============================================
// ROUTES
// ============================================

app.use('/api/documents', documentRoutes)

// Health check avanzato
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: NODE_ENV,
    version: process.env.npm_package_version || '1.0.0'
  }
  
  // Check Redis se configurato
  if (process.env.REDIS_URL) {
    try {
      const IORedis = (await import('ioredis')).default
      const redis = new IORedis(process.env.REDIS_URL)
      await redis.ping()
      health.redis = 'connected'
      await redis.quit()
    } catch (e) {
      health.redis = 'disconnected'
      health.status = 'degraded'
    }
  }
  
  res.json(health)
})

// Readiness check (per Kubernetes/load balancer)
app.get('/api/ready', (req, res) => {
  res.json({ ready: true })
})

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint non trovato' })
})

// Global error handler
app.use((err, req, res, next) => {
  log.error('Unhandled error', { 
    error: err.message, 
    stack: err.stack,
    path: req.path
  })
  
  // Non esporre dettagli errori in produzione
  const message = isProduction ? 'Errore interno del server' : err.message
  
  res.status(err.status || 500).json({ 
    error: message,
    ...(isProduction ? {} : { stack: err.stack })
  })
})

// ============================================
// SOCKET.IO HANDLERS
// ============================================

initSocketHandlers(io)

// ============================================
// SERVER STARTUP
// ============================================

const server = httpServer.listen(PORT, () => {
  log.info(`Server started`, { 
    port: PORT, 
    environment: NODE_ENV,
    corsOrigins: CORS_ORIGINS
  })
  console.log(`\nmyMD Server running on http://localhost:${PORT}`)
  console.log(`WebSocket ready for real-time updates`)
  console.log(`Security: Helmet, Rate Limiting, CORS configured`)
  console.log(`Environment: ${NODE_ENV}`)
  console.log(`Uploads: ${join(__dirnameLocal, 'uploads')}\n`)
})

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

const gracefulShutdown = async (signal) => {
  log.info(`${signal} received, shutting down gracefully...`)
  
  // Smetti di accettare nuove connessioni
  server.close(async () => {
    log.info('HTTP server closed')
    
    // Chiudi Socket.io
    io.close(() => {
      log.info('Socket.io closed')
    })
    
    // Chiudi job queues
    try {
      const { getDocumentQueue, getOCRQueue } = await import('./services/jobQueue.js')
      await getDocumentQueue().close()
      await getOCRQueue().close()
      log.info('Job queues closed')
    } catch (e) {
      // Queue non inizializzate
    }
    
    log.info('Shutdown complete')
    process.exit(0)
  })
  
  // Force shutdown dopo 30 secondi
  setTimeout(() => {
    log.error('Forced shutdown after timeout')
    process.exit(1)
  }, 30000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// Gestione errori non catturati
process.on('uncaughtException', (err) => {
  log.error('Uncaught exception', { error: err.message, stack: err.stack })
  gracefulShutdown('UNCAUGHT_EXCEPTION')
})

process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled rejection', { reason: String(reason) })
})

export { io }
