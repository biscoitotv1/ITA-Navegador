const fs = require('fs')
const path = require('path')
const Store = require('../shared/Store')

class StudioModule {
  constructor() {
    this.name = 'studio'
    this.projectsPath = path.join(Store.get('settings.userData') || path.join(require('os').homedir(), '.ita-browser'), 'projects')
    this.ensureProjectsPath()
  }

  ensureProjectsPath() {
    if (!fs.existsSync(this.projectsPath)) {
      fs.mkdirSync(this.projectsPath, { recursive: true })
    }
  }

  createProject(name) {
    const projectPath = path.join(this.projectsPath, name)
    if (fs.existsSync(projectPath)) {
      return { success: false, error: 'Project already exists' }
    }

    const structure = {
      Assets: { Scenes: {}, Scripts: {}, Models: {}, Textures: {}, Materials: {}, Audio: {}, Animations: {}, Prefabs: {}, Shaders: {}, Particles: {} },
      Scenes: {},
      Scripts: {},
      Models: {},
      Textures: {},
      Materials: {},
      Audio: {},
      Animations: {},
      Prefabs: {},
      Shaders: {},
      Config: {},
      Builds: {},
      ProjectSettings: { 'project.json': JSON.stringify({ name, version: '1.0.0', engine: 'ITA Game Studio' }, null, 2) }
    }

    Object.entries(structure).forEach(([folder, content]) => {
      const folderPath = path.join(projectPath, folder)
      fs.mkdirSync(folderPath, { recursive: true })
      if (typeof content === 'object') {
        Object.entries(content).forEach(([file, data]) => {
          fs.writeFileSync(path.join(folderPath, file), data)
        })
      } else if (content) {
        fs.writeFileSync(folderPath, content)
      }
    })

    return { success: true, path: projectPath }
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

  getIpcHandlers() {
    return {
      'studio-create-project': async (_event, name) => this.createProject(name),
      'studio-list-projects': async () => this.listProjects()
    }
  }
}

module.exports = new StudioModule()
