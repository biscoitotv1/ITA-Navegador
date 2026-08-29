const fs = require('fs')
const path = require('path')
const Store = require('../shared/Store')

class AssetManager {
  constructor() {
    this.name = 'assets'
    this.assetsPath = path.join(Store.get('settings.userData') || path.join(require('os').homedir(), '.ita-browser'), 'assets')
    this.ensureAssetsPath()
    this.assets = this.loadAssets()
  }

  ensureAssetsPath() {
    if (!fs.existsSync(this.assetsPath)) {
      fs.mkdirSync(this.assetsPath, { recursive: true })
    }
    const categories = ['Models', 'Textures', 'Materials', 'Audio', 'Scenes', 'Scripts', 'Prefabs', 'Shaders']
    categories.forEach(cat => {
      const catPath = path.join(this.assetsPath, cat)
      if (!fs.existsSync(catPath)) {
        fs.mkdirSync(catPath, { recursive: true })
      }
    })
  }

  loadAssets() {
    const assets = []
    const categories = ['Models', 'Textures', 'Materials', 'Audio', 'Scenes', 'Scripts', 'Prefabs', 'Shaders']
    const extensions = {
      'Models': ['.fbx', '.obj', '.gltf', '.glb', '.dae'],
      'Textures': ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tga', '.webp'],
      'Materials': ['.mat', '.json'],
      'Audio': ['.mp3', '.wav', '.ogg', '.flac', '.aac'],
      'Scenes': ['.scene', '.json'],
      'Scripts': ['.js', '.ts', '.py', '.cs'],
      'Prefabs': ['.prefab', '.json'],
      'Shaders': ['.shader', '.glsl', '.hlsl', '.fx']
    }

    categories.forEach(category => {
      const catPath = path.join(this.assetsPath, category)
      if (!fs.existsSync(catPath)) return
      const files = fs.readdirSync(catPath)
      files.forEach(file => {
        const ext = path.extname(file).toLowerCase()
        if (extensions[category].includes(ext)) {
          const filePath = path.join(catPath, file)
          const stats = fs.statSync(filePath)
          assets.push({
            id: this.generateAssetId(file, category),
            name: file,
            category,
            path: filePath,
            size: stats.size,
            modified: stats.mtime,
            extension: ext,
            metadata: this.readMetadata(filePath, category)
          })
        }
      })
    })

    return assets
  }

  readMetadata(filePath, category) {
    try {
      const metadataPath = filePath + '.meta'
      if (fs.existsSync(metadataPath)) {
        return JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
      }
    } catch {
      // ignore
    }
    return {}
  }

  writeMetadata(filePath, metadata) {
    try {
      const metadataPath = filePath + '.meta'
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
    } catch {
      // ignore
    }
  }

  generateAssetId(file, category) {
    const str = category + file
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(16)
  }

  importAsset(filePath, category = null) {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Arquivo não encontrado' }
    }

    const ext = path.extname(filePath).toLowerCase()
    if (!category) {
      for (const [cat, exts] of Object.entries({
        'Models': ['.fbx', '.obj', '.gltf', '.glb', '.dae'],
        'Textures': ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tga', '.webp'],
        'Materials': ['.mat', '.json'],
        'Audio': ['.mp3', '.wav', '.ogg', '.flac', '.aac'],
        'Scenes': ['.scene', '.json'],
        'Scripts': ['.js', '.ts', '.py', '.cs'],
        'Prefabs': ['.prefab', '.json'],
        'Shaders': ['.shader', '.glsl', '.hlsl', '.fx']
      })) {
        if (exts.includes(ext)) {
          category = cat
          break
        }
      }
    }

    if (!category) {
      return { success: false, error: 'Categoria não determinada para a extensão ' + ext }
    }

    const fileName = path.basename(filePath)
    const destPath = path.join(this.assetsPath, category, fileName)
    
    if (fs.existsSync(destPath)) {
      const baseName = path.basename(fileName, ext)
      const newName = `${baseName}_${Date.now()}${ext}`
      const newDestPath = path.join(this.assetsPath, category, newName)
      fs.copyFileSync(filePath, newDestPath)
    } else {
      fs.copyFileSync(filePath, destPath)
    }

    this.assets = this.loadAssets()
    const asset = this.assets[this.assets.length - 1]
    return { success: true, asset }
  }

  generatePreview(assetId) {
    const asset = this.assets.find(a => a.id === assetId)
    if (!asset) return null

    try {
      if (asset.category === 'Textures') {
        return this.generateImagePreview(asset.path)
      } else if (asset.category === 'Models') {
        return this.generateModelPreview(asset)
      } else if (asset.category === 'Audio') {
        return this.generateAudioPreview(asset)
      } else if (asset.category === 'Scenes') {
        return this.generateScenePreview(asset)
      } else {
        return this.generateDefaultPreview(asset)
      }
    } catch {
      return this.generateDefaultPreview(asset)
    }
  }

  generateImagePreview(imagePath) {
    // Processo main não possui DOM: retorna preview simbólico
    // (a renderização da imagem ocorre no renderer via file:// URL)
    return {
      type: 'image',
      icon: '🖼️',
      color: '#3b82f6',
      url: 'file:///' + String(imagePath).replace(/\\/g, '/'),
      name: path.basename(imagePath)
    }
  }

  generateModelPreview(asset) {
    return {
      type: 'model',
      icon: '📦',
      color: '#3b5bdb',
      name: asset.name
    }
  }

  generateAudioPreview(asset) {
    return {
      type: 'audio',
      icon: '🔊',
      color: '#40c057',
      name: asset.name
    }
  }

  generateScenePreview(asset) {
    return {
      type: 'scene',
      icon: '🎬',
      color: '#facc15',
      name: asset.name
    }
  }

  generateDefaultPreview(asset) {
    const icons = {
      'Scripts': '📜',
      'Prefabs': '🧩',
      'Shaders': '✨',
      'Materials': '🎨'
    }
    const colors = {
      'Scripts': '#63e6be',
      'Prefabs': '#9aa3b2',
      'Shaders': '#facc15',
      'Materials': '#ff6b6b'
    }
    
    return {
      type: 'default',
      icon: icons[asset.category] || '📄',
      color: colors[asset.category] || '#9aa3b2',
      name: asset.name
    }
  }

  deleteAsset(assetId) {
    const asset = this.assets.find(a => a.id === assetId)
    if (!asset) return { success: false, error: 'Asset não encontrado' }

    try {
      if (fs.existsSync(asset.path)) {
        fs.unlinkSync(asset.path)
      }
      const metadataPath = asset.path + '.meta'
      if (fs.existsSync(metadataPath)) {
        fs.unlinkSync(metadataPath)
      }
      this.assets = this.assets.filter(a => a.id !== assetId)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  getAsset(assetId) {
    return this.assets.find(a => a.id === assetId) || null
  }

  getAssetsByCategory(category) {
    return this.assets.filter(a => a.category === category)
  }

  searchAssets(query) {
    const q = query.toLowerCase()
    return this.assets.filter(a => 
      a.name.toLowerCase().includes(q) || 
      a.category.toLowerCase().includes(q)
    )
  }

  getIpcHandlers() {
    return {
      'assets-list': async () => this.assets,
      'assets-list-by-category': async (_event, category) => this.getAssetsByCategory(category),
      'assets-search': async (_event, query) => this.searchAssets(query),
      'assets-import': async (_event, filePath, category) => this.importAsset(filePath, category),
      'assets-delete': async (_event, assetId) => this.deleteAsset(assetId),
      'assets-get': async (_event, assetId) => this.getAsset(assetId),
      'assets-get-path': async (_event, assetId) => {
        const asset = this.getAsset(assetId)
        return asset ? asset.path : null
      },
      'assets-generate-preview': async (_event, assetId) => this.generatePreview(assetId)
    }
  }
}

module.exports = new AssetManager()
