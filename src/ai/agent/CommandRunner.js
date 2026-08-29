/* =========================================================
   ITA AI — Command Runner
   Execução REAL de comandos com níveis de segurança
   🟢 Seguro (auto) | 🟡 Alteração (aprovação) | 🔴 Perigoso (bloqueado)
   A IA nunca finge que executou: o resultado aqui é real.
   ========================================================= */

const { exec } = require('child_process')
const path = require('path')

const ALLOWED_PREFIXES = ['node', 'npm', 'git', 'ollama', 'dir', 'type', 'where', 'echo']

const GREEN_PATTERNS = [
  /^node\s+--version$/i,
  /^node\s+-v$/i,
  /^node\s+--check\s+"?[\w\\\/.:-]+"?$/i,
  /^npm\s+(-v|--version)$/i,
  /^npm\s+test(\s+--[\w-]+(\s+\S+)?)?$/i,
  /^npm\s+run\s+(build|lint|check)(\s+--[\w-]+(\s+\S+)?)?$/i,
  /^npm\s+ls(\s+[\w@\/.-]+)?$/i,
  /^git\s+(status|diff|log|branch|show|remote)(\s+[\w\-\/.= ]+)?$/i,
  /^ollama\s+list$/i,
  /^ollama\s+ps$/i,
  /^dir(\/[bw]|\s+[\w\\\/.:-]+)*$/i,
  /^type\s+"?[\w\\\/.:-]+"?$/i,
  /^where\s+[\w.-]+$/i,
  /^echo\s+.+$/i
]

const YELLOW_PATTERNS = [
  /^npm\s+(install|i|uninstall|ci)\b/i,
  /^npm\s+init\b/i,
  /^npm\s+run\s+(?!build\b|lint\b|check\b)[\w:-]+/i,
  /^git\s+(add|commit|checkout\s+-b|init)\b/i,
  /^ollama\s+pull\b/i,
  /^node\s+(?!--version|-v|--check)[\w\\\/.-]+\.js$/i
]

const RED_PATTERNS = [
  /rm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)/i,
  /\bdel\b|\brmdir\b|\berase\b/i,
  /\bformat\b/i,
  /\bshutdown\b|\brestart-computer\b/i,
  /\breg(add|delete|edit|svr32)\b|\breg\.exe\b/i,
  /remove-item/i,
  /drop\s+table/i,
  /\btaskkill\b|\btaskkill\.exe\b/i,
  /\bcurl\b[^\n|]*\|\s*(sh|bash|powershell|cmd)/i,
  /\bdd\s+if=/i,
  /:\(\)\s*\{.*\};\s*:/,
  /\bmkfs\b/i,
  /\bvssadmin\b|\bbcdedit\b/i,
  /\bnet\s+user\b/i,
  /\bschtasks\b/i,
  />\s*[cC]:\\(Windows|Program Files)/,
  /\bSet-ExecutionPolicy\b/i,
  /\bInvoke-Expression\b|\biex\b/i
]

class CommandRunner {
  constructor(projectRoot) {
    this.root = projectRoot || path.join(__dirname, '..', '..', '..')
    this.history = []
  }

  classify(command) {
    const trimmed = String(command || '').trim()

    if (!trimmed) {
      return { level: 'invalid', allowed: false, requiresApproval: false, reason: 'Comando vazio' }
    }

    if (RED_PATTERNS.some(pattern => pattern.test(trimmed))) {
      return { level: 'red', allowed: false, requiresApproval: true, reason: 'Comando potencialmente destrutivo — bloqueado por padrão' }
    }

    const prefixAllowed = ALLOWED_PREFIXES.some(prefix => trimmed.toLowerCase().startsWith(prefix + ' ') || trimmed.toLowerCase() === prefix)
    if (!prefixAllowed) {
      return { level: 'red', allowed: false, requiresApproval: true, reason: `Comando fora da lista permitida (${ALLOWED_PREFIXES.join(', ')})` }
    }

    if (GREEN_PATTERNS.some(pattern => pattern.test(trimmed))) {
      return { level: 'green', allowed: true, requiresApproval: false, reason: 'Comando seguro de leitura/verificação' }
    }

    if (YELLOW_PATTERNS.some(pattern => pattern.test(trimmed))) {
      return { level: 'yellow', allowed: true, requiresApproval: true, reason: 'Comando de alteração — requer aprovação' }
    }

    return { level: 'yellow', allowed: true, requiresApproval: true, reason: 'Comando não classificado — tratado como alteração (requer aprovação)' }
  }

  run(command, options = {}) {
    const classification = this.classify(command)
    const confirmed = Boolean(options.confirmed)

    if (classification.level === 'red' && !confirmed) {
      return Promise.resolve({
        executed: false,
        blocked: true,
        classification,
        command,
        exitCode: null,
        stdout: '',
        stderr: '',
        durationMs: 0,
        message: `Bloqueado: ${classification.reason}`
      })
    }

    if (classification.requiresApproval && !confirmed) {
      return Promise.resolve({
        executed: false,
        blocked: true,
        needsApproval: true,
        classification,
        command,
        exitCode: null,
        stdout: '',
        stderr: '',
        durationMs: 0,
        message: `Aprovação necessária: ${classification.reason}`
      })
    }

    const timeout = options.timeout || 120000
    const startedAt = Date.now()

    return new Promise(resolve => {
      exec(command, {
        cwd: options.cwd || this.root,
        timeout,
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '' }
      }, (error, stdout, stderr) => {
        const durationMs = Date.now() - startedAt
        const result = {
          executed: true,
          blocked: false,
          needsApproval: false,
          classification,
          command,
          exitCode: error && typeof error.code === 'number' ? error.code : (error ? 1 : 0),
          stdout: String(stdout || '').slice(0, 40000),
          stderr: String(stderr || '').slice(0, 40000),
          timedOut: Boolean(error && error.killed),
          durationMs,
          message: error ? `Comando finalizado com código ${error.code !== undefined ? error.code : '?'}` : 'Comando executado com sucesso'
        }

        this.history.push({
          command,
          exitCode: result.exitCode,
          at: new Date().toISOString(),
          durationMs
        })
        if (this.history.length > 100) this.history = this.history.slice(-100)

        resolve(result)
      })
    })
  }

  getHistory() {
    return [...this.history]
  }
}

module.exports = CommandRunner
