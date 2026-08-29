const path = require('path')
const fs = require('fs')
const { nativeAudio } = require('electron').nativeTheme || {}

class AudioClip {
  constructor(id, filePath, format = 'mp3') {
    this.id = id
    this.filePath = filePath
    this.format = format
    this.duration = 0
    this.sampleRate = 44100
    this.channels = 2
    this.loaded = false
  }

  async load() {
    try {
      const stat = fs.statSync(this.filePath)
      this.size = stat.size
      this.loaded = true
      return true
    } catch {
      this.loaded = false
      return false
    }
  }
}

class AudioSource {
  constructor() {
    this.clip = null
    this.volume = 1
    this.loop = false
    this.playOnAwake = false
    this.spatialBlend = 0
    this.pitch = 1
    this.minDistance = 1
    this.maxDistance = 500
    this.rolloffFactor = 1
    this.currentTime = 0
    this.isPlaying = false
    this.isPaused = false
    this.playbackRate = 1
  }
}

class AudioListener {
  constructor() {
    this.position = { x: 0, y: 0, z: 0 }
    this.rotation = { x: 0, y: 0, z: 0 }
    this.velocity = { x: 0, y: 0, z: 0 }
  }

  update(position, rotation) {
    this.position = position
    this.rotation = rotation
  }
}

class AudioSystem {
  constructor() {
    this.clips = new Map()
    this.sources = new Map()
    this.listener = new AudioListener()
    this.masterVolume = 1
    this.musicVolume = 1
    this.sfxVolume = 1
    this.currentlyPlaying = new Map()
    this.audioContext = null
    this.nextSourceId = 1
    this.eventListeners = {}
  }

  on(event, callback) {
    if (!this.eventListeners[event]) this.eventListeners[event] = []
    this.eventListeners[event].push(callback)
  }

  off(event, callback) {
    if (!this.eventListeners[event]) return
    this.eventListeners[event] = this.eventListeners[event].filter(cb => cb !== callback)
  }

  emit(event, data) {
    if (!this.eventListeners[event]) return
    this.eventListeners[event].forEach(cb => cb(data))
  }

  async init() {
    try {
      this.audioContext = {
        state: 'running',
        sampleRate: 44100
      }
      return true
    } catch {
      return false
    }
  }

  loadClip(id, filePath) {
    const ext = path.extname(filePath).toLowerCase().slice(1)
    const clip = new AudioClip(id, filePath, ext)
    this.clips.set(id, clip)
    return clip
  }

  async loadClipAsync(id, filePath) {
    const clip = this.loadClip(id, filePath)
    await clip.load()
    return clip
  }

  createSource() {
    const source = new AudioSource()
    const id = 'source_' + this.nextSourceId++
    this.sources.set(id, source)
    return { id, source }
  }

  removeSource(id) {
    const source = this.sources.get(id)
    if (source && source.isPlaying) {
      this.stopSource(id)
    }
    this.sources.delete(id)
  }

  async play(id) {
    const source = this.sources.get(id)
    if (!source || !source.clip) return false

    if (!this.clips.has(source.clip)) {
      const clip = this.loadClip(source.clip, source.clip)
      await clip.load()
    }

    source.isPlaying = true
    source.isPaused = false
    source.currentTime = 0
    this.currentlyPlaying.set(id, source)
    this.emit('play', { sourceId: id, clip: source.clip })
    return true
  }

  pause(id) {
    const source = this.sources.get(id)
    if (!source || !source.isPlaying) return false
    source.isPaused = true
    source.isPlaying = false
    this.currentlyPlaying.delete(id)
    this.emit('pause', { sourceId: id })
    return true
  }

  resume(id) {
    const source = this.sources.get(id)
    if (!source || !source.isPaused) return false
    source.isPaused = false
    source.isPlaying = true
    this.currentlyPlaying.set(id, source)
    this.emit('resume', { sourceId: id })
    return true
  }

  stop(id) {
    const source = this.sources.get(id)
    if (!source) return false
    source.isPlaying = false
    source.isPaused = false
    source.currentTime = 0
    this.currentlyPlaying.delete(id)
    this.emit('stop', { sourceId: id })
    return true
  }

  stopAll() {
    for (const id of this.currentlyPlaying.keys()) {
      this.stop(id)
    }
  }

  setVolume(id, volume) {
    const source = this.sources.get(id)
    if (source) {
      source.volume = Math.max(0, Math.min(1, volume))
    }
  }

  setMasterVolume(volume) {
    this.masterVolume = Math.max(0, Math.min(1, volume))
  }

  setMusicVolume(volume) {
    this.musicVolume = Math.max(0, Math.min(1, volume))
  }

  setSfxVolume(volume) {
    this.sfxVolume = Math.max(0, Math.min(1, volume))
  }

  setSpatialBlend(id, blend) {
    const source = this.sources.get(id)
    if (source) {
      source.spatialBlend = Math.max(0, Math.min(1, blend))
    }
  }

  getClipInfo(id) {
    const clip = this.clips.get(id)
    if (!clip) return null
    return {
      id: clip.id,
      filePath: clip.filePath,
      format: clip.format,
      duration: clip.duration,
      sampleRate: clip.sampleRate,
      channels: clip.channels,
      loaded: clip.loaded
    }
  }

  getAllClips() {
    return Array.from(this.clips.values()).map(clip => ({
      id: clip.id,
      filePath: clip.filePath,
      format: clip.format,
      duration: clip.duration,
      loaded: clip.loaded
    }))
  }

  getSourceInfo(id) {
    const source = this.sources.get(id)
    if (!source) return null
    return {
      id,
      clip: source.clip,
      volume: source.volume,
      loop: source.loop,
      playOnAwake: source.playOnAwake,
      spatialBlend: source.spatialBlend,
      pitch: source.pitch,
      isPlaying: source.isPlaying,
      isPaused: source.isPaused
    }
  }

  getAllSources() {
    return Array.from(this.sources.entries()).map(([id, source]) => ({
      id,
      clip: source.clip,
      volume: source.volume,
      loop: source.loop,
      isPlaying: source.isPlaying,
      isPaused: source.isPaused
    }))
  }

  getListener() {
    return { ...this.listener }
  }

  update() {
    if (this.audioContext && this.audioContext.state !== 'running') {
      this.audioContext.state = 'running'
    }
  }

  getIpcHandlers() {
    return {
      'audio-init': async () => this.init(),
      'audio-load-clip': async (_event, id, filePath) => this.loadClipAsync(id, filePath),
      'audio-create-source': async () => this.createSource(),
      'audio-remove-source': async (_event, id) => { this.removeSource(id); return { success: true } },
      'audio-play': async (_event, id) => this.play(id),
      'audio-pause': async (_event, id) => this.pause(id),
      'audio-resume': async (_event, id) => this.resume(id),
      'audio-stop': async (_event, id) => this.stop(id),
      'audio-stop-all': async () => this.stopAll(),
      'audio-set-volume': async (_event, id, volume) => { this.setVolume(id, volume); return { success: true } },
      'audio-set-master-volume': async (_event, volume) => { this.setMasterVolume(volume); return { success: true } },
      'audio-set-spatial-blend': async (_event, id, blend) => { this.setSpatialBlend(id, blend); return { success: true } },
      'audio-get-clip-info': async (_event, id) => this.getClipInfo(id),
      'audio-get-source-info': async (_event, id) => this.getSourceInfo(id),
      'audio-get-all-clips': async () => this.getAllClips(),
      'audio-get-all-sources': async () => this.getAllSources()
    }
  }
}

const audioSystem = new AudioSystem()

audioSystem.on('play', () => {})
audioSystem.on('pause', () => {})
audioSystem.on('resume', () => {})
audioSystem.on('stop', () => {})

module.exports = audioSystem
