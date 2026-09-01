/* =========================================================
   ITA AI — Project Memory
   Memória permanente do projeto (ciclo do Agente)
   ========================================================= */

const fs = require('fs')
const path = require('path')

const DEFAULT_MEMORY = {
  project: 'ITA Browser',
  architecture: 'Electron (main.js) + AppCore (browser, studio, editor, build, physics, audio, network, ai) + ITA AI via Ollama',
  decisions: [],
  knownProblems: [],
  completedFeatures: [],
  pendingFeatures: [],
  preferences: [],
  opportunities: [],
  lastAnalysis: null,
  lastSuccessfulBuild: null,
  cycleHistory: [],
  notes: {},
  updatedAt: null
}

class ProjectMemory {
  constructor(dataDir) {
    this.dataDir = dataDir || path.join(__dirname, '..', '..', '..', '.ita-agent')
    this.backupDir = path.join(this.dataDir, 'backups')
    this.file = path.join(this.dataDir, 'memory.json')
    this.data = this.load()
  }

  ensureDirs() {
    try {
      if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true })
      if (!fs.existsSync(this.backupDir)) fs.mkdirSync(this.backupDir, { recursive: true })
    } catch (err) {
      console.error('ProjectMemory: falha ao criar diretórios:', err.message)
    }
  }

  load() {
    try {
      if (fs.existsSync(this.file)) {
        const parsed = JSON.parse(fs.readFileSync(this.file, 'utf-8'))
        return { ...DEFAULT_MEMORY, ...parsed }
      }
    } catch (err) {
      console.error('ProjectMemory: falha ao carregar:', err.message)
    }
    return { ...DEFAULT_MEMORY }
  }

  save() {
    this.ensureDirs()
    try {
      this.data.updatedAt = new Date().toISOString()
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2))
      return true
    } catch (err) {
      console.error('ProjectMemory: falha ao salvar:', err.message)
      return false
    }
  }

  addDecision(text) {
    if (!text) return false
    if (!this.data.decisions.some(d => d.text === text)) {
      this.data.decisions.push({ text, at: new Date().toISOString() })
      return this.save()
    }
    return false
  }

  addKnownProblem(text, details = {}) {
    if (!text) return false
    const exists = this.data.knownProblems.some(p => p.text === text)
    if (!exists) {
      this.data.knownProblems.push({ text, ...details, reportedAt: new Date().toISOString(), resolved: false })
      return this.save()
    }
    return false
  }

  resolveKnownProblem(text) {
    const item = this.data.knownProblems.find(p => p.text === text || p.id === text)
    if (item) {
      item.resolved = true
      item.resolvedAt = new Date().toISOString()
      return this.save()
    }
    return false
  }

  addCompletedFeature(title, details = {}) {
    if (!title) return false
    if (!this.data.completedFeatures.some(f => f.title === title)) {
      this.data.completedFeatures.push({ title, ...details, at: new Date().toISOString() })
      return this.save()
    }
    return false
  }

  addPendingFeature(title, details = {}) {
    if (!title) return false
    if (!this.data.pendingFeatures.some(f => f.title === title)) {
      this.data.pendingFeatures.push({ title, ...details, addedAt: new Date().toISOString() })
      return this.save()
    }
    return false
  }

  completePendingFeature(title) {
    const idx = this.data.pendingFeatures.findIndex(f => f.title === title)
    if (idx === -1) return false
    const [feature] = this.data.pendingFeatures.splice(idx, 1)
    this.addCompletedFeature(feature.title, { fromPending: true })
    return this.save()
  }

  addPreference(preference) {
    if (!preference) return false
    if (!this.data.preferences.includes(preference)) {
      this.data.preferences.push(preference)
      return this.save()
    }
    return false
  }

  setLastAnalysis(analysis) {
    this.data.lastAnalysis = { ...analysis, at: new Date().toISOString() }
    return this.save()
  }

  setLastSuccessfulBuild(info) {
    this.data.lastSuccessfulBuild = { ...info, at: new Date().toISOString() }
    return this.save()
  }

  recordCycle(cycle) {
    this.data.cycleHistory.push({ ...cycle, at: new Date().toISOString() })
    if (this.data.cycleHistory.length > 50) {
      this.data.cycleHistory = this.data.cycleHistory.slice(-50)
    }
    return this.save()
  }

  setNote(key, value) {
    this.data.notes[key] = value
    return this.save()
  }

  upsertOpportunity(opportunity) {
    const idx = this.data.opportunities.findIndex(o => o.id === opportunity.id)
    if (idx === -1) {
      this.data.opportunities.push(opportunity)
    } else {
      const previous = this.data.opportunities[idx]
      this.data.opportunities[idx] = { ...previous, ...opportunity, status: previous.status || 'pending' }
    }
    return this.save()
  }

  // Substitui a lista inteira (análises antigas não se acumulam para sempre)
  replaceOpportunities(list) {
    this.data.opportunities = Array.isArray(list) ? list : []
    return this.save()
  }

  updateOpportunityStatus(id, status) {
    const item = this.data.opportunities.find(o => o.id === id)
    if (!item) return false
    item.status = status
    item.statusAt = new Date().toISOString()
    return this.save()
  }

  getAll() {
    return this.data
  }

  reset() {
    this.data = { ...DEFAULT_MEMORY }
    this.save()
    return this.data
  }
}

module.exports = ProjectMemory
