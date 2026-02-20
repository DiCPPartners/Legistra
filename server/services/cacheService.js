/**
 * Cache Service
 * Caching intelligente per ottimizzare performance
 * Supporta in-memory (sviluppo) e Redis (produzione)
 */

import { createContextLogger } from './logger.js'

const log = createContextLogger('Cache')

const REDIS_URL = process.env.REDIS_URL
const USE_REDIS = !!REDIS_URL

/**
 * In-Memory Cache con LRU eviction
 */
class InMemoryCache {
  constructor(maxSize = 1000, defaultTTL = 3600000) {
    this.cache = new Map()
    this.maxSize = maxSize
    this.defaultTTL = defaultTTL // 1 ora default
    this.hits = 0
    this.misses = 0
  }

  async get(key) {
    const item = this.cache.get(key)
    
    if (!item) {
      this.misses++
      return null
    }
    
    // Verifica TTL
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key)
      this.misses++
      return null
    }
    
    this.hits++
    
    // Aggiorna posizione per LRU
    this.cache.delete(key)
    this.cache.set(key, item)
    
    return item.value
  }

  async set(key, value, ttl = null) {
    // Eviction se cache piena
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      this.cache.delete(oldestKey)
    }
    
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttl || this.defaultTTL)
    })
    
    return true
  }

  async del(key) {
    return this.cache.delete(key)
  }

  async clear() {
    this.cache.clear()
    this.hits = 0
    this.misses = 0
  }

  async has(key) {
    const value = await this.get(key)
    return value !== null
  }

  getStats() {
    const total = this.hits + this.misses
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total * 100).toFixed(2) + '%' : '0%'
    }
  }
}

/**
 * Redis Cache per produzione
 */
class RedisCache {
  constructor(defaultTTL = 3600) {
    this.defaultTTL = defaultTTL // secondi
    this.redis = null
    this.initPromise = this.init()
  }

  async init() {
    try {
      const IORedis = (await import('ioredis')).default
      this.redis = new IORedis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100
      })
      
      this.redis.on('error', (err) => {
        log.error('Redis connection error', { error: err.message })
      })
      
      log.info('Redis cache connected')
    } catch (error) {
      log.error('Failed to connect to Redis', { error: error.message })
    }
  }

  async get(key) {
    await this.initPromise
    if (!this.redis) return null
    
    try {
      const value = await this.redis.get(key)
      return value ? JSON.parse(value) : null
    } catch (error) {
      log.error('Redis get error', { key, error: error.message })
      return null
    }
  }

  async set(key, value, ttl = null) {
    await this.initPromise
    if (!this.redis) return false
    
    try {
      const serialized = JSON.stringify(value)
      if (ttl) {
        await this.redis.setex(key, ttl, serialized)
      } else {
        await this.redis.setex(key, this.defaultTTL, serialized)
      }
      return true
    } catch (error) {
      log.error('Redis set error', { key, error: error.message })
      return false
    }
  }

  async del(key) {
    await this.initPromise
    if (!this.redis) return false
    
    try {
      await this.redis.del(key)
      return true
    } catch (error) {
      log.error('Redis del error', { key, error: error.message })
      return false
    }
  }

  async clear() {
    await this.initPromise
    if (!this.redis) return
    
    // Usa pattern per cancellare solo chiavi dell'app
    const keys = await this.redis.keys('mymd:*')
    if (keys.length > 0) {
      await this.redis.del(...keys)
    }
  }

  async has(key) {
    await this.initPromise
    if (!this.redis) return false
    
    const exists = await this.redis.exists(key)
    return exists === 1
  }

  async getStats() {
    await this.initPromise
    if (!this.redis) return { status: 'disconnected' }
    
    const info = await this.redis.info('stats')
    return {
      status: 'connected',
      info: info.split('\n').slice(0, 10).join('\n')
    }
  }

  async close() {
    if (this.redis) {
      await this.redis.quit()
    }
  }
}

// Singleton cache instance
let cacheInstance = null

export function getCache() {
  if (!cacheInstance) {
    if (USE_REDIS) {
      log.info('Using Redis cache')
      cacheInstance = new RedisCache()
    } else {
      log.info('Using in-memory cache')
      cacheInstance = new InMemoryCache()
    }
  }
  return cacheInstance
}

/**
 * Cache keys helpers
 */
export const CacheKeys = {
  transcription: (hash) => `mymd:transcription:${hash}`,
  ocr: (hash) => `mymd:ocr:${hash}`,
  analysis: (batchId) => `mymd:analysis:${batchId}`,
  userTemplates: (userId) => `mymd:templates:${userId}`,
  documentMeta: (docId) => `mymd:doc:${docId}`
}

/**
 * Cache decorator per funzioni
 */
export function cached(keyFn, ttl = 3600000) {
  const cache = getCache()
  
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value
    
    descriptor.value = async function(...args) {
      const key = keyFn(...args)
      
      // Check cache
      const cached = await cache.get(key)
      if (cached !== null) {
        log.debug('Cache hit', { key })
        return cached
      }
      
      // Execute and cache
      const result = await originalMethod.apply(this, args)
      await cache.set(key, result, ttl)
      log.debug('Cache miss, stored', { key })
      
      return result
    }
    
    return descriptor
  }
}

/**
 * Wrapper per caching manuale
 */
export async function withCache(key, ttl, fetchFn) {
  const cache = getCache()
  
  const cached = await cache.get(key)
  if (cached !== null) {
    return cached
  }
  
  const result = await fetchFn()
  await cache.set(key, result, ttl)
  
  return result
}

/**
 * Hash per content-based caching
 */
export async function hashContent(content) {
  const encoder = new TextEncoder()
  const data = encoder.encode(typeof content === 'string' ? content : JSON.stringify(content))
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export default { 
  getCache, 
  CacheKeys, 
  cached, 
  withCache, 
  hashContent 
}
