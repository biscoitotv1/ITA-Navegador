/* =========================================================
   ITA AI — Context Engine
   Nível 1: Observar o estado real do projeto
   ========================================================= */

const fs = require('fs')
const path = require('path')
const http = require('http')
const { execFile } = require('child_process')

class ContextEngine {
  constructor(projectRoot) {
    this.root = projectRoot || path.join(__dirname, '..', '..', '..')
    this.ignoreDirs = new Set(['node_modules', '.git', '.ita-agent', 'dist', 'out', 'build_output'])
    this.textExtensions = new Set(['.js', '.json', '.html', '.css', '.md', '.txt', '.ts'])
    this.maxFiles = 500
  }

  run(command, args, options = {}) {
    return new Promise(resolve => {
      execFile(command, args, { cwd: this.root, timeout: 10000, windowsHide: true, ...options }, (error, stdout, stderr) => {
        resolve({ ok: !error, stdout: String(stdout || '').trim(), stderr: String(stderr || '').trim(), error: error ? error.message : null })
      })
    })
  }

  walk(dir, acc = [], depth = 0) {
    if (depth > 6 || acc.length >= this.maxFiles) return acc
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return acc
    }
    for (const entry of entries) {
      if (acc.length >= this.maxFiles) break
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (this.ignoreDirs.has(entry.name)) continue
        this.walk(full, acc, depth + 1)
      } else if (entry.isFile()) {
        let size = 0
        try {
          size = fs.statSync(full).size
        } catch {
          size = 0
        }
        acc.push({
          path: path.relative(this.root, full).replace(/\\/g, '/'),
          name: entry.name,
          ext: path.extname(entry.name).toLowerCase(),
          size,
          isText: this.textExtensions.has(path.extname(entry.name).toLowerCase())
        })
      }
    }
    return acc
  }

  readPackage() {
    try {
      const raw = fs.readFileSync(path.join(this.root, 'package.json'), 'utf-8')
      const pkg = JSON.parse(raw)
      return {
        name: pkg.name,
        version: pkg.version,
        scripts: pkg.scripts || {},
        dependencies: pkg.dependencies || {},
        devDependencies: pkg.devDependencies || {},
        hasTestScript: Boolean(pkg.scripts && pkg.scripts.test && !/no test specified/i.test(pkg.scripts.test)),
        hasBuildScript: Boolean(pkg.scripts && pkg.scripts.build)
      }
    } catch (err) {
      return { error: err.message }
    }
  }

  readFile(relativePath, maxBytes = 300000) {
    const full = path.join(this.root, relativePath)
    try {
      const stat = fs.statSync(full)
      if (!stat.isFile() || stat.size > maxBytes) return null
      return fs.readFileSync(full, 'utf-8')
    } catch {
      return null
    }
  }

  listCodeFiles() {
    const files = this.walk(this.root)
    return files.filter(f => ['.js', '.html', '.css', '.json'].includes(f.ext) && f.name !== 'package-lock.json')
  }

  async gitInfo() {
    const inside = await this.run('git', ['rev-parse', '--is-inside-work-tree'])
    if (!inside.ok || inside.stdout.trim() !== 'true') {
      return { isRepo: false }
    }
    const [branch, status, log] = await Promise.all([
      this.run('git', ['rev-parse', '--abbrev-ref', 'HEAD']),
      this.run('git', ['status', '--porcelain']),
      this.run('git', ['log', '--oneline', '-5'])
    ])
    const statusLines = status.stdout ? status.stdout.split('\n').filter(Boolean) : []
    return {
      isRepo: true,
      branch: branch.stdout || null,
      changedFiles: statusLines.length,
      statusSample: statusLines.slice(0, 20),
      lastCommits: log.stdout ? log.stdout.split('\n').filter(Boolean).slice(0, 5) : []
    }
  }

  httpGetJson(targetUrl, timeoutMs = 4000) {
    return new Promise(resolve => {
      try {
        const parsed = new URL(targetUrl)
        const request = http.request({
          hostname: parsed.hostname,
          port: parsed.port || 80,
          path: parsed.pathname + parsed.search,
          method: 'GET',
          timeout: timeoutMs
        }, response => {
          let body = ''
          response.on('data', chunk => { body += chunk })
          response.on('end', () => {
            try {
              resolve({ ok: response.statusCode === 200, status: response.statusCode, body: JSON.parse(body) })
            } catch {
              resolve({ ok: response.statusCode === 200, status: response.statusCode, body: null })
            }
          })
        })
        request.on('timeout', () => { request.destroy(); resolve({ ok: false, status: 0, body: null }) })
        request.on('error', () => resolve({ ok: false, status: 0, body: null }))
        request.end()
      } catch {
        resolve({ ok: false, status: 0, body: null })
      }
    })
  }

  async observe() {
    const files = this.walk(this.root)
    const byExtension = {}
    let totalLines = 0
    let totalBytes = 0
    const codeFiles = []

    for (const file of files) {
      byExtension[file.ext || '(sem ext)'] = (byExtension[file.ext || '(sem ext)'] || 0) + 1
      totalBytes += file.size
      if (file.isText) {
        const content = this.readFile(file.path, 200000)
        if (content) {
          const lines = content.split('\n').length
          totalLines += lines
          if (['.js', '.html', '.css'].includes(file.ext)) {
            codeFiles.push({ ...file, lines })
          }
        }
      }
    }

    const [git, ollama] = await Promise.all([
      this.gitInfo(),
      this.httpGetJson('http://localhost:11434/api/tags')
    ])

    const largest = [...codeFiles].sort((a, b) => b.lines - a.lines).slice(0, 5).map(f => ({ path: f.path, lines: f.lines }))

    const snapshot = {
      observedAt: new Date().toISOString(),
      root: this.root,
      package: this.readPackage(),
      files: {
        count: files.length,
        byExtension,
        totalBytes,
        totalLines,
        largest,
        codeFiles: codeFiles.map(f => ({ path: f.path, ext: f.ext, lines: f.lines }))
      },
      git,
      ollama: {
        url: 'http://localhost:11434',
        running: ollama.ok,
        models: ollama.ok && ollama.body && Array.isArray(ollama.body.models) ? ollama.body.models.map(m => m.name) : []
      },
      warnings: []
    }

    if (files.length >= this.maxFiles) snapshot.warnings.push('Limite de varredura de arquivos atingido (análise parcial)')
    if (!snapshot.package.name) snapshot.warnings.push('package.json não pôde ser lido')

    return snapshot
  }
}

module.exports = ContextEngine
