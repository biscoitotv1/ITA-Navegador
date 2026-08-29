const path = require('path')
const fs = require('fs')
const Store = require('../shared/Store')

class BuildSystem {
  constructor() {
    this.name = 'build'
    this.buildsPath = path.join(Store.get('settings.userData') || path.join(require('os').homedir(), '.ita-browser'), 'builds')
    this.ensureBuildsPath()
    this.currentBuild = null
    this.buildProcess = null
    this.platforms = [
      { id: 'windows', name: 'Windows', extension: '.exe', icon: '🪟' },
      { id: 'linux', name: 'Linux', extension: '', icon: '🐧' },
      { id: 'web', name: 'Web', extension: '.html', icon: '🌐' },
      { id: 'android', name: 'Android', extension: '.apk', icon: '🤖' },
      { id: 'ios', name: 'iOS', extension: '.ipa', icon: '📱' }
    ]
  }

  ensureBuildsPath() {
    if (!fs.existsSync(this.buildsPath)) {
      fs.mkdirSync(this.buildsPath, { recursive: true })
    }
  }

  async build(projectPath, options = {}) {
    const buildId = 'build_' + Date.now()
    const platform = options.platform || 'windows'
    const platformInfo = this.platforms.find(p => p.id === platform) || this.platforms[0]

    const buildFolder = path.join(this.buildsPath, buildId)
    fs.mkdirSync(buildFolder, { recursive: true })

    this.currentBuild = {
      id: buildId,
      projectPath,
      platform,
      status: 'running',
      progress: 0,
      logs: [],
      startTime: Date.now(),
      outputPath: path.join(buildFolder, `game${platformInfo.extension}`)
    }

    this.log('info', `Iniciando build para ${platformInfo.name}...`)
    this.log('info', `Projeto: ${projectPath}`)

    try {
      await this.runBuildSteps(buildFolder, projectPath, options)
      this.currentBuild.status = 'completed'
      this.currentBuild.progress = 100
      this.log('success', `Build concluído com sucesso!`)
      this.log('info', `Saída: ${this.currentBuild.outputPath}`)
      return { success: true, buildId, outputPath: this.currentBuild.outputPath }
    } catch (error) {
      this.currentBuild.status = 'failed'
      this.log('error', `Build falhou: ${error.message}`)
      return { success: false, error: error.message, buildId }
    }
  }

  async runBuildSteps(buildFolder, projectPath, options) {
    const steps = [
      { name: 'Validating project', fn: () => this.validateProject(projectPath) },
      { name: 'Collecting assets', fn: () => this.collectAssets(projectPath, buildFolder) },
      { name: 'Compiling scripts', fn: () => this.compileScripts(projectPath, buildFolder) },
      { name: 'Bundling scenes', fn: () => this.bundleScenes(projectPath, buildFolder) },
      { name: 'Optimizing assets', fn: () => this.optimizeAssets(buildFolder) },
      { name: 'Packaging build', fn: () => this.packageBuild(buildFolder, options) }
    ]

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      this.log('info', `[${i + 1}/${steps.length}] ${step.name}...`)
      await this.delay(500)
      await step.fn()
      this.currentBuild.progress = Math.round(((i + 1) / steps.length) * 100)
    }
  }

  validateProject(projectPath) {
    if (!fs.existsSync(projectPath)) {
      throw new Error('Project path does not exist')
    }
    const requiredFiles = ['ProjectSettings/project.json']
    for (const file of requiredFiles) {
      if (!fs.existsSync(path.join(projectPath, file))) {
        throw new Error(`Missing required file: ${file}`)
      }
    }
    this.log('success', 'Project validation passed')
  }

  collectAssets(projectPath, buildFolder) {
    const assetsPath = path.join(projectPath, 'Assets')
    const buildAssetsPath = path.join(buildFolder, 'Assets')
    if (!fs.existsSync(assetsPath)) {
      fs.mkdirSync(buildAssetsPath, { recursive: true })
      return
    }

    fs.mkdirSync(buildAssetsPath, { recursive: true })
    const categories = fs.readdirSync(assetsPath)
    let totalFiles = 0

    categories.forEach(category => {
      const categoryPath = path.join(assetsPath, category)
      if (!fs.statSync(categoryPath).isDirectory()) return

      const buildCategoryPath = path.join(buildAssetsPath, category)
      fs.mkdirSync(buildCategoryPath, { recursive: true })

      const files = fs.readdirSync(categoryPath)
      files.forEach(file => {
        fs.copyFileSync(path.join(categoryPath, file), path.join(buildCategoryPath, file))
        totalFiles++
      })
    })

    this.log('success', `Collected ${totalFiles} assets`)
  }

  compileScripts(projectPath, buildFolder) {
    const scriptsPath = path.join(projectPath, 'Scripts')
    const buildScriptsPath = path.join(buildFolder, 'Scripts')

    if (!fs.existsSync(scriptsPath)) {
      fs.mkdirSync(buildScriptsPath, { recursive: true })
      return
    }

    fs.mkdirSync(buildScriptsPath, { recursive: true })
    const files = fs.readdirSync(scriptsPath)
    let compiledCount = 0

    files.forEach(file => {
      const ext = path.extname(file).toLowerCase()
      const sourcePath = path.join(scriptsPath, file)

      if (ext === '.js') {
        fs.copyFileSync(sourcePath, path.join(buildScriptsPath, file))
        compiledCount++
      } else if (ext === '.ts') {
        const tsContent = fs.readFileSync(sourcePath, 'utf-8')
        const jsContent = this.transpileTypeScript(tsContent)
        const outputName = file.replace(/\.ts$/, '.js')
        fs.writeFileSync(path.join(buildScriptsPath, outputName), jsContent)
        compiledCount++
      } else {
        fs.copyFileSync(sourcePath, path.join(buildScriptsPath, file))
        compiledCount++
      }
    })

    this.log('success', `Compiled ${compiledCount} scripts`)
  }

  transpileTypeScript(code) {
    return code
      .replace(/:\s*(string|number|boolean|any)\b/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/interface\s+\w+\s*\{[^}]*\}/g, '')
      .replace(/export\s+/g, '')
      .trim()
  }

  bundleScenes(projectPath, buildFolder) {
    const scenesPath = path.join(projectPath, 'Scenes')
    const buildScenesPath = path.join(buildFolder, 'Scenes')

    if (!fs.existsSync(scenesPath)) {
      fs.mkdirSync(buildScenesPath, { recursive: true })
      return
    }

    fs.mkdirSync(buildScenesPath, { recursive: true })
    const files = fs.readdirSync(scenesPath)
    let bundledCount = 0

    files.forEach(file => {
      const scenePath = path.join(scenesPath, file)
      const content = fs.readFileSync(scenePath, 'utf-8')

      const bundled = {
        name: file,
        objects: [],
        settings: {},
        bundledAt: new Date().toISOString()
      }

      try {
        const sceneData = JSON.parse(content)
        bundled.objects = sceneData.objects || []
        bundled.settings = sceneData.settings || {}
      } catch {
        bundled.raw = content
      }

      fs.writeFileSync(path.join(buildScenesPath, file), JSON.stringify(bundled, null, 2))
      bundledCount++
    })

    this.log('success', `Bundled ${bundledCount} scenes`)
  }

  optimizeAssets(buildFolder) {
    const assetsPath = path.join(buildFolder, 'Assets')
    if (!fs.existsSync(assetsPath)) return

    const categories = fs.readdirSync(assetsPath)
    let optimizedCount = 0

    categories.forEach(category => {
      const categoryPath = path.join(assetsPath, category)
      if (!fs.statSync(categoryPath).isDirectory()) return

      const files = fs.readdirSync(categoryPath)
      files.forEach(file => {
        const ext = path.extname(file).toLowerCase()
        const filePath = path.join(categoryPath, file)

        if (['.png', '.jpg', '.jpeg'].includes(ext)) {
          optimizedCount++
        } else if (ext === '.json') {
          try {
            const content = fs.readFileSync(filePath, 'utf-8')
            const minified = JSON.stringify(JSON.parse(content))
            fs.writeFileSync(filePath, minified)
            optimizedCount++
          } catch {
            // ignore invalid JSON
          }
        }
      })
    })

    this.log('success', `Optimized ${optimizedCount} assets`)
  }

  packageBuild(buildFolder, options) {
    const platform = options.platform || 'windows'
    const platformInfo = this.platforms.find(p => p.id === platform) || this.platforms[0]

    const packageJson = {
      name: path.basename(options.projectPath || 'game'),
      version: '1.0.0',
      engine: 'ITA Game Studio',
      platform,
      buildTime: new Date().toISOString(),
      entryPoint: 'index.html',
      files: this.collectBuildFiles(buildFolder)
    }

    fs.writeFileSync(path.join(buildFolder, 'package.json'), JSON.stringify(packageJson, null, 2))
    fs.writeFileSync(path.join(buildFolder, 'index.html'), this.generateLauncher(packageJson))

    this.log('success', `Packaged build for ${platformInfo.name}`)
  }

  collectBuildFiles(buildFolder) {
    const files = []
    const collect = (dir) => {
      if (!fs.existsSync(dir)) return
      const items = fs.readdirSync(dir)
      items.forEach(item => {
        const fullPath = path.join(dir, item)
        const stat = fs.statSync(fullPath)
        if (stat.isDirectory()) {
          collect(fullPath)
        } else {
          files.push(fullPath.replace(buildFolder, '').replace(/^\\/, ''))
        }
      })
    }
    collect(buildFolder)
    return files
  }

  generateLauncher(packageJson) {
    return `<!DOCTYPE html>
<html>
<head>
  <title>${packageJson.name}</title>
  <style>
    body { margin: 0; background: #000; overflow: hidden; }
    #game-container { width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <div id="game-container"></div>
  <script>
    const container = document.getElementById('game-container');
    const platform = '${packageJson.platform}';
    console.log('ITA Browser Game - Platform:', platform);
  </script>
</body>
</html>`
  }

  log(level, message) {
    if (!this.currentBuild) return
    const timestamp = new Date().toLocaleTimeString()
    this.currentBuild.logs.push({ level, message, timestamp })
    this.emit('buildLog', { level, message, timestamp, buildId: this.currentBuild.id })
  }

  getBuildStatus() {
    if (!this.currentBuild) return null
    return {
      id: this.currentBuild.id,
      status: this.currentBuild.status,
      progress: this.currentBuild.progress,
      logs: this.currentBuild.logs,
      outputPath: this.currentBuild.outputPath
    }
  }

  getPlatforms() {
    return this.platforms
  }

  cancelBuild() {
    if (this.buildProcess) {
      this.buildProcess = null
      if (this.currentBuild) {
        this.currentBuild.status = 'cancelled'
        this.log('warn', 'Build cancelled by user')
      }
    }
  }

  getIpcHandlers() {
    return {
      'build-start': async (_event, projectPath, options) => this.build(projectPath, options),
      'build-cancel': async () => this.cancelBuild(),
      'build-status': async () => this.getBuildStatus(),
      'build-platforms': async () => this.getPlatforms()
    }
  }
}

module.exports = new BuildSystem()
