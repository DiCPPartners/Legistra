/**
 * Logger Professionale per Produzione
 * Usa Winston per logging strutturato con livelli e rotazione
 */

import winston from 'winston'

const { combine, timestamp, printf, colorize, errors } = winston.format

// Formato per console (sviluppo)
const consoleFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  let log = `${timestamp} [${level}]: ${message}`
  if (Object.keys(meta).length > 0) {
    log += ` ${JSON.stringify(meta)}`
  }
  if (stack) {
    log += `\n${stack}`
  }
  return log
})

// Formato per file/produzione (JSON strutturato)
const jsonFormat = printf(({ level, message, timestamp, ...meta }) => {
  return JSON.stringify({
    timestamp,
    level,
    message,
    ...meta
  })
})

// Determina ambiente
const isProduction = process.env.NODE_ENV === 'production'

// Transports
const transports = [
  // Console sempre attiva
  new winston.transports.Console({
    format: combine(
      colorize(),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      errors({ stack: true }),
      consoleFormat
    )
  })
]

// In produzione, aggiungi file logging
if (isProduction) {
  transports.push(
    // Errori separati
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: combine(timestamp(), jsonFormat),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Tutti i log
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: combine(timestamp(), jsonFormat),
      maxsize: 5242880,
      maxFiles: 5
    })
  )
}

// Crea logger
const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  defaultMeta: { service: 'mymd-server' },
  transports
})

// Helper per logging con contesto
export const createContextLogger = (context) => ({
  debug: (message, meta = {}) => logger.debug(message, { context, ...meta }),
  info: (message, meta = {}) => logger.info(message, { context, ...meta }),
  warn: (message, meta = {}) => logger.warn(message, { context, ...meta }),
  error: (message, meta = {}) => logger.error(message, { context, ...meta })
})

export default logger
