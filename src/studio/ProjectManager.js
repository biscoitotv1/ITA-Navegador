const fs = require('fs')
const path = require('path')
const Store = require('../shared/Store')

class ProjectManager {
  constructor() {
    this.name = 'project'
    this.projectsPath = path.join(Store.get('settings.userData') || path.join(require('os').homedir(), '.ita-browser'), 'projects')
    this.ensureProjectsPath()
    this.currentProject = null
  }

  ensureProjectsPath() {
    if (!fs.existsSync(this.projectsPath)) {
      fs.mkdirSync(this.projectsPath, { recursive: true })
    }
  }

  createProject(name, settings = {}) {
    const projectPath = path.join(this.projectsPath, name)
    if (fs.existsSync(projectPath)) {
      return { success: false, error: 'Project already exists' }
    }

    const folders = [
      'Assets/Models',
      'Assets/Textures',
      'Assets/Materials',
      'Assets/Audio',
      'Assets/Scenes',
      'Assets/Scripts',
      'Assets/Prefabs',
      'Assets/Shaders',
      'Assets/Particles',
      'Scenes',
      'Scripts',
      'Builds',
      'ProjectSettings'
    ]

    folders.forEach(folder => {
      const folderPath = path.join(projectPath, folder)
      fs.mkdirSync(folderPath, { recursive: true })
    })

    const projectSettings = {
      name,
      version: '1.0.0',
      engine: 'ITA Game Studio',
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      settings: {
        ...settings,
        physics: { gravity: { x: 0, y: -9.81, z: 0 }, timestep: 0.016 },
        rendering: { shadows: true, antialiasing: true, postProcessing: false },
        audio: { masterVolume: 1.0, musicVolume: 0.8, sfxVolume: 1.0 }
      }
    }

    fs.writeFileSync(path.join(projectPath, 'ProjectSettings', 'project.json'), JSON.stringify(projectSettings, null, 2))
    fs.writeFileSync(path.join(projectPath, 'ProjectSettings', 'editor.json'), JSON.stringify({
      currentScene: 'main.scene',
      snapSettings: { translate: 0.5, rotate: 15, scale: 0.1 },
      viewport: { cameraPosition: { x: 8, y: 6, z: 8 }, cameraTarget: { x: 0, y: 0, z: 0 } }
    }, null, 2))

    this.currentProject = name
    return { success: true, path: projectPath, name }
  }

  loadProject(name) {
    const projectPath = path.join(this.projectsPath, name)
    if (!fs.existsSync(projectPath)) {
      return { success: false, error: 'Project not found' }
    }

    try {
      const settingsPath = path.join(projectPath, 'ProjectSettings', 'project.json')
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      this.currentProject = name
      return { success: true, name, path: projectPath, settings }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  getCurrentProject() {
    if (!this.currentProject) return null
    return this.loadProject(this.currentProject)
  }

  listProjects() {
    try {
      return fs.readdirSync(this.projectsPath).filter(name => {
        const stats = fs.statSync(path.join(this.projectsPath, name))
        return stats.isDirectory()
      })
    } catch {
      return []
    }
  }

  deleteProject(name) {
    const projectPath = path.join(this.projectsPath, name)
    if (!fs.existsSync(projectPath)) {
      return { success: false, error: 'Project not found' }
    }

    try {
      fs.rmSync(projectPath, { recursive: true, force: true })
      if (this.currentProject === name) {
        this.currentProject = null
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  saveScene(projectName, sceneName, sceneData) {
    const projectPath = path.join(this.projectsPath, projectName || this.currentProject)
    if (!projectPath || !fs.existsSync(projectPath)) {
      return { success: false, error: 'No project loaded' }
    }

    try {
      const scenesPath = path.join(projectPath, 'Scenes')
      if (!fs.existsSync(scenesPath)) {
        fs.mkdirSync(scenesPath, { recursive: true })
      }

      const scenePath = path.join(scenesPath, sceneName)
      fs.writeFileSync(scenePath, JSON.stringify(sceneData, null, 2))

      const settingsPath = path.join(projectPath, 'ProjectSettings', 'project.json')
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
        settings.modifiedAt = new Date().toISOString()
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
      }

      return { success: true, path: scenePath }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  loadScene(projectName, sceneName) {
    const projectPath = path.join(this.projectsPath, projectName || this.currentProject)
    if (!projectPath || !fs.existsSync(projectPath)) {
      return { success: false, error: 'No project loaded' }
    }

    const scenePath = path.join(projectPath, 'Scenes', sceneName)
    if (!fs.existsSync(scenePath)) {
      return { success: false, error: 'Scene not found' }
    }

    try {
      const data = JSON.parse(fs.readFileSync(scenePath, 'utf-8'))
      return { success: true, data, path: scenePath }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  listScenes(projectName) {
    const projectPath = path.join(this.projectsPath, projectName || this.currentProject)
    if (!projectPath || !fs.existsSync(projectPath)) {
      return []
    }

    const scenesPath = path.join(projectPath, 'Scenes')
    if (!fs.existsSync(scenesPath)) {
      return []
    }

    try {
      return fs.readdirSync(scenesPath).filter(file => {
        const ext = path.extname(file).toLowerCase()
        return ['.scene', '.json'].includes(ext)
      })
    } catch {
      return []
    }
  }

  getProjectPath(projectName) {
    return path.join(this.projectsPath, projectName || this.currentProject || '')
  }

  getScenesPath(projectName) {
    return path.join(this.getProjectPath(projectName), 'Scenes')
  }

  getAssetsPath(projectName) {
    return path.join(this.getProjectPath(projectName), 'Assets')
  }

  getIpcHandlers() {
    return {
      'project-create': async (_event, name, settings) => this.createProject(name, settings),
      'project-load': async (_event, name) => this.loadProject(name),
      'project-delete': async (_event, name) => this.deleteProject(name),
      'project-list': async () => this.listProjects(),
      'project-get-current': async () => this.getCurrentProject(),
      'scene-save': async (_event, sceneName, sceneData) => this.saveScene(null, sceneName, sceneData),
      'scene-load': async (_event, sceneName) => this.loadScene(null, sceneName),
      'scene-list': async () => this.listScenes(null),
      'project-get-path': async (_event) => this.getProjectPath(),
      'project-get-scenes-path': async (_event) => this.getScenesPath(),
      'project-get-assets-path': async (_event) => this.getAssetsPath()
    }
  }
}

module.exports = new ProjectManager()
