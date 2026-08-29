const EventEmitter = require('events')

class Store extends EventEmitter {
  constructor() {
    super()
    this.state = {
      currentModule: 'browser',
      projects: [],
      favorites: [],
      settings: {
        theme: 'dark',
        hardwareAcceleration: false
      }
    }
  }

  get(key) {
    return key.split('.').reduce((obj, k) => obj && obj[k], this.state)
  }

  set(key, value) {
    const keys = key.split('.')
    const last = keys.pop()
    const target = keys.reduce((obj, k) => obj && obj[k], this.state)
    if (target) {
      target[last] = value
      this.emit('change', { key, value })
    }
  }

  getAll() {
    return this.state
  }
}

module.exports = new Store()
