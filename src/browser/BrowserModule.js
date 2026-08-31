const path = require('path')
const fs = require('fs')
const Store = require('../shared/Store')

class BrowserModule {
  constructor() {
    this.name = 'browser'
    this.favoritesPath = path.join(Store.get('settings.userData') || path.join(require('os').homedir(), '.ita-browser'), 'favorites.json')
    this.favorites = this.loadFavorites()
  }

  loadFavorites() {
    try {
      if (fs.existsSync(this.favoritesPath)) {
        return JSON.parse(fs.readFileSync(this.favoritesPath, 'utf-8'))
      }
    } catch {
      // ignore
    }
    return []
  }

  saveFavorites() {
    try {
      fs.writeFileSync(this.favoritesPath, JSON.stringify(this.favorites, null, 2))
    } catch {
      // ignore
    }
  }

  getIpcHandlers() {
    return {
      'browser-navigate': async (_event, url) => {
        let target = url.trim()
        if (!/^https?:\/\//i.test(target)) {
          if (target === 'home.html') {
            const homeTemplate = fs.readFileSync(path.join(__dirname, '..', '..', 'home.html'), 'utf-8')
            target = 'data:text/html;charset=utf-8;base64,' + Buffer.from(homeTemplate).toString('base64')
          } else if (target.startsWith('file://')) {
            target = target
          } else {
            target = 'https://' + target
          }
        }
        return target
      },
      'browser-go-back': async () => 'back',
      'browser-go-forward': async () => 'forward',
      'browser-reload': async () => 'reload',
      'browser-get-favorites': async () => this.favorites,
      'browser-save-favorite': async (_event, item) => {
        this.favorites.push(item)
        this.saveFavorites()
        return this.favorites
      },
      'browser-remove-favorite': async (_event, index) => {
        this.favorites.splice(index, 1)
        this.saveFavorites()
        return this.favorites
      }
    }
  }

  getHomeHtml() {
    return fs.readFileSync(path.join(__dirname, '..', '..', 'home.html'), 'utf-8')
  }
}

module.exports = new BrowserModule()
