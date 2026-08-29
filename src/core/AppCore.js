const path = require('path')
const Store = require('../shared/Store')

class AppCore {
  constructor() {
    this.modules = new Map()
    this.mainWindow = null
    this.listeners = new Map()
  }

  register(name, module) {
    this.modules.set(name, module)
  }

  getModule(name) {
    return this.modules.get(name)
  }

  on(event, listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event).push(listener)
  }

  emit(event, payload) {
    const listeners = this.listeners.get(event) || []
    listeners.forEach(fn => fn(payload))
  }

  switchModule(name) {
    const module = this.modules.get(name)
    if (!module) return
    Store.set('currentModule', name)
    this.emit('moduleSwitched', name)
    if (this.mainWindow && module.getHtml) {
      this.mainWindow.webContents.send('module-switch', name)
    }
  }

  init(mainWindow) {
    this.mainWindow = mainWindow
  }
}

module.exports = new AppCore()
