/**
 * Socket.io Handler
 * Gestisce connessioni WebSocket per aggiornamenti real-time
 */

// Store per connessioni utente
const userSockets = new Map()

export function initSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`)

    // Autenticazione utente
    socket.on('auth', ({ userId }) => {
      if (!userId) {
        socket.emit('error', { message: 'userId richiesto' })
        return
      }

      // Aggiungi socket alla room dell'utente
      const room = `user:${userId}`
      socket.join(room)
      
      // Track connessione
      if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set())
      }
      userSockets.get(userId).add(socket.id)

      socket.userId = userId
      console.log(`User ${userId} authenticated (socket: ${socket.id})`)
      
      socket.emit('auth:success', { 
        message: 'Connesso al server',
        socketId: socket.id 
      })
    })

    // Richiesta stato job
    socket.on('job:status', ({ batchId }) => {
      // Il client può richiedere lo stato di un batch specifico
      socket.emit('job:status:response', { batchId, status: 'checking' })
    })

    // Disconnessione
    socket.on('disconnect', (reason) => {
      console.log(`Client disconnected: ${socket.id} (${reason})`)
      
      if (socket.userId && userSockets.has(socket.userId)) {
        userSockets.get(socket.userId).delete(socket.id)
        if (userSockets.get(socket.userId).size === 0) {
          userSockets.delete(socket.userId)
        }
      }
    })

    // Ping per keep-alive
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() })
    })
  })

  // Log connessioni attive ogni 30 secondi
  setInterval(() => {
    const totalConnections = io.engine.clientsCount
    const uniqueUsers = userSockets.size
    if (totalConnections > 0) {
      console.log(`Active connections: ${totalConnections} sockets, ${uniqueUsers} users`)
    }
  }, 30000)
}

export function notifyUser(io, userId, event, data) {
  io.to(`user:${userId}`).emit(event, data)
}

export function getUserConnectionCount(userId) {
  return userSockets.get(userId)?.size || 0
}
