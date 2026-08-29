const EventEmitter = require('events')

class NetworkManager extends EventEmitter {
  constructor() {
    super()
    this.rooms = new Map()
    this.clients = new Map()
    this.server = null
    this.client = null
    this.isHosting = false
    this.connected = false
    this.roomId = null
    this.playerId = null
    this.players = new Map()
    this.events = []
    this.syncRate = 20
    this.lastSync = 0
    this.state = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      animation: 'idle',
      inputs: {}
    }
  }

  host(port = 7777, roomName = 'default') {
    return new Promise((resolve, reject) => {
      try {
        this.isHosting = true
        this.roomId = roomName
        this.playerId = 'host_' + Date.now()

        this.rooms.set(roomName, {
          id: roomName,
          host: this.playerId,
          players: new Map(),
          maxPlayers: 16,
          createdAt: Date.now(),
          settings: {
            name: roomName,
            password: null,
            voice: true,
            friendlyFire: false
          }
        })

        this.rooms.get(roomName).players.set(this.playerId, {
          id: this.playerId,
          name: 'Host',
          isHost: true,
          joinedAt: Date.now(),
          state: { ...this.state }
        })

        this.connected = true
        this.emit('roomCreated', { roomId: roomName, playerId: this.playerId })
        resolve({ success: true, roomId: roomName, playerId: this.playerId })
      } catch (error) {
        reject({ success: false, error: error.message })
      }
    })
  }

  join(roomId, playerName = 'Player') {
    return new Promise((resolve) => {
      this.roomId = roomId
      this.playerId = 'player_' + Date.now()

      this.rooms.set(roomId, this.rooms.get(roomId) || {
        id: roomId,
        host: null,
        players: new Map(),
        maxPlayers: 16,
        createdAt: Date.now(),
        settings: { name: roomId, password: null, voice: true, friendlyFire: false }
      })

      const room = this.rooms.get(roomId)
      room.players.set(this.playerId, {
        id: this.playerId,
        name: playerName,
        isHost: false,
        joinedAt: Date.now(),
        state: { ...this.state }
      })

      this.players = room.players
      this.connected = true

      this.emit('playerJoined', { playerId: this.playerId, name: playerName, roomId })
      resolve({ success: true, roomId, playerId: this.playerId })
    })
  }

  leave() {
    if (!this.roomId || !this.playerId) return
    const room = this.rooms.get(this.roomId)
    if (room) {
      room.players.delete(this.playerId)
      this.emit('playerLeft', { playerId: this.playerId, roomId: this.roomId })
    }
    this.connected = false
    this.isHosting = false
    this.roomId = null
    this.playerId = null
    this.players = new Map()
  }

  sendEvent(type, data = {}) {
    if (!this.connected || !this.roomId) return
    const event = {
      id: Math.random().toString(36).slice(2, 9),
      type,
      data,
      senderId: this.playerId,
      timestamp: Date.now()
    }
    this.events.push(event)
    this.emit('eventReceived', event)
  }

  broadcastState() {
    if (!this.connected || !this.roomId) return
    const room = this.rooms.get(this.roomId)
    if (!room) return

    const player = room.players.get(this.playerId)
    if (player) {
      player.state = { ...this.state }
      player.lastUpdate = Date.now()
    }

    this.emit('stateBroadcast', {
      playerId: this.playerId,
      state: this.state,
      timestamp: Date.now()
    })
  }

  updateState(key, value) {
    if (key.includes('.')) {
      const [parent, child] = key.split('.')
      if (this.state[parent]) {
        this.state[parent][child] = value
      }
    } else {
      this.state[key] = value
    }
    this.emit('stateUpdated', { key, value, playerId: this.playerId })
  }

  getRoomInfo() {
    if (!this.roomId) return null
    const room = this.rooms.get(this.roomId)
    if (!room) return null

    return {
      id: room.id,
      host: room.host,
      playerCount: room.players.size,
      maxPlayers: room.maxPlayers,
      players: Array.from(room.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost
      }))
    }
  }

  getPlayerInfo() {
    if (!this.playerId || !this.roomId) return null
    const room = this.rooms.get(this.roomId)
    if (!room) return null
    return room.players.get(this.playerId) || null
  }

  getPlayers() {
    if (!this.roomId) return []
    const room = this.rooms.get(this.roomId)
    if (!room) return []
    return Array.from(room.players.values())
  }

  getRecentEvents(count = 50) {
    return this.events.slice(-count)
  }

  clearEvents() {
    this.events = []
  }

  isConnected() {
    return this.connected
  }

  isRoomHost() {
    if (!this.roomId || !this.playerId) return false
    const room = this.rooms.get(this.roomId)
    if (!room) return false
    return room.host === this.playerId
  }

  getIpcHandlers() {
    return {
      'network-host': async (_event, port, roomName) => this.host(port, roomName),
      'network-join': async (_event, roomId, playerName) => this.join(roomId, playerName),
      'network-leave': async () => this.leave(),
      'network-send-event': async (_event, type, data) => this.sendEvent(type, data),
      'network-broadcast-state': async () => this.broadcastState(),
      'network-update-state': async (_event, key, value) => this.updateState(key, value),
      'network-get-room-info': async () => this.getRoomInfo(),
      'network-get-player-info': async () => this.getPlayerInfo(),
      'network-get-players': async () => this.getPlayers(),
      'network-get-events': async () => this.getRecentEvents(),
      'network-clear-events': async () => this.clearEvents(),
      'network-is-connected': async () => this.isConnected(),
      'network-is-host': async () => this.isRoomHost()
    }
  }
}

module.exports = new NetworkManager()
