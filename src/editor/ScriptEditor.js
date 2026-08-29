const fs = require('fs')
const path = require('path')

class ScriptEditor {
  constructor() {
    this.scripts = new Map()
    this.scriptDirectory = path.join(process.cwd(), 'Scripts')
    this.extensions = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.py': 'python',
      '.cs': 'csharp',
      '.lua': 'lua',
      '.cpp': 'cpp',
      '.c': 'c'
    }
    this.ensureScriptDirectory()
  }

  ensureScriptDirectory() {
    if (!fs.existsSync(this.scriptDirectory)) {
      fs.mkdirSync(this.scriptDirectory, { recursive: true })
    }
  }

  createScript(name, content = '', language = 'javascript') {
    const ext = this.getExtensionFromLanguage(language)
    const fullName = name.endsWith(ext) ? name : name + ext
    const scriptPath = path.join(this.scriptDirectory, fullName)

    const script = {
      id: 'script_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: fullName,
      path: scriptPath,
      language,
      content: content || this.getDefaultTemplate(language),
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    this.scripts.set(script.id, script)
    this.saveToDisk(script)
    return script
  }

  loadScript(scriptPath) {
    if (!fs.existsSync(scriptPath)) {
      return null
    }

    const ext = path.extname(scriptPath).toLowerCase()
    const language = this.extensions[ext] || 'text'
    const content = fs.readFileSync(scriptPath, 'utf-8')
    const stat = fs.statSync(scriptPath)

    const script = {
      id: 'script_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: path.basename(scriptPath),
      path: scriptPath,
      language,
      content,
      createdAt: stat.birthtime ? stat.birthtime.getTime() : Date.now(),
      updatedAt: stat.mtime ? stat.mtime.getTime() : Date.now()
    }

    this.scripts.set(script.id, script)
    return script
  }

  saveScript(scriptId) {
    const script = this.scripts.get(scriptId)
    if (!script) return { success: false, error: 'Script not found' }

    script.updatedAt = Date.now()
    this.saveToDisk(script)
    return { success: true, scriptId }
  }

  updateScriptContent(scriptId, content) {
    const script = this.scripts.get(scriptId)
    if (!script) return { success: false, error: 'Script not found' }

    script.content = content
    script.updatedAt = Date.now()
    this.saveToDisk(script)
    return { success: true, scriptId }
  }

  deleteScript(scriptId) {
    const script = this.scripts.get(scriptId)
    if (!script) return { success: false, error: 'Script not found' }

    if (fs.existsSync(script.path)) {
      fs.unlinkSync(script.path)
    }

    this.scripts.delete(scriptId)
    return { success: true }
  }

  getScript(scriptId) {
    const script = this.scripts.get(scriptId)
    return script ? { ...script } : null
  }

  getAllScripts() {
    return Array.from(this.scripts.values()).map(script => ({
      id: script.id,
      name: script.name,
      language: script.language,
      path: script.path,
      createdAt: script.createdAt,
      updatedAt: script.updatedAt
    }))
  }

  scanScriptDirectory() {
    if (!fs.existsSync(this.scriptDirectory)) return []

    const files = fs.readdirSync(this.scriptDirectory)
    const scripts = []

    files.forEach(file => {
      const ext = path.extname(file).toLowerCase()
      const language = this.extensions[ext]
      if (language) {
        const scriptPath = path.join(this.scriptDirectory, file)
        const existing = this.scripts.get(scriptPath)
        if (!existing) {
          const script = this.loadScript(scriptPath)
          if (script) {
            scripts.push(script)
          }
        }
      }
    })

    return scripts
  }

  getExtensionFromLanguage(language) {
    const map = {
      'javascript': '.js',
      'typescript': '.ts',
      'python': '.py',
      'csharp': '.cs',
      'lua': '.lua',
      'cpp': '.cpp',
      'c': '.c',
      'text': '.txt'
    }
    return map[language] || '.txt'
  }

  getDefaultTemplate(language) {
    const templates = {
      javascript: `// ITA Browser Game Script
// Language: JavaScript

class Script {
  constructor(gameObject) {
    this.gameObject = gameObject
    this.enabled = true
  }

  start() {
    console.log('Script started on', this.gameObject.name)
  }

  update(deltaTime, time) {
    // Called every frame
  }

  onCollisionEnter(other) {
    console.log('Collided with', other.name)
  }

  onTriggerEnter(other) {
    console.log('Trigger entered with', other.name)
  }

  onDestroy() {
    console.log('Script destroyed')
  }
}

module.exports = Script
`,
      typescript: `// ITA Browser Game Script
// Language: TypeScript

interface GameObject {
  name: string
  position: Vector3
  rotation: Vector3
  scale: Vector3
}

class Script {
  private gameObject: GameObject
  private enabled: boolean = true

  constructor(gameObject: GameObject) {
    this.gameObject = gameObject
  }

  start(): void {
    console.log('Script started on', this.gameObject.name)
  }

  update(deltaTime: number, time: number): void {
    // Called every frame
  }

  onCollisionEnter(other: GameObject): void {
    console.log('Collided with', other.name)
  }
}

export default Script
`,
      python: `# ITA Browser Game Script
# Language: Python

class Script:
    def __init__(self, game_object):
        self.game_object = game_object
        self.enabled = True

    def start(self):
        print(f"Script started on {self.game_object['name']}")

    def update(self, delta_time, time):
        # Called every frame
        pass

    def on_collision_enter(self, other):
        print(f"Collided with {other['name']}")

    def on_trigger_enter(self, other):
        print(f"Trigger entered with {other['name']}")

    def on_destroy(self):
        print("Script destroyed")
`,
      csharp: `// ITA Browser Game Script
// Language: C#

using UnityEngine;

public class Script : MonoBehaviour
{
    private GameObject gameObject;

    void Start()
    {
        Debug.Log("Script started on " + gameObject.name);
    }

    void Update()
    {
        // Called every frame
    }

    void OnCollisionEnter(Collision other)
    {
        Debug.Log("Collided with " + other.gameObject.name);
    }

    void OnTriggerEnter(Collider other)
    {
        Debug.Log("Trigger entered with " + other.gameObject.name);
    }

    void OnDestroy()
    {
        Debug.Log("Script destroyed");
    }
}
`
    }
    return templates[language] || `// ${language} script\n`
  }

  saveToDisk(script) {
    try {
      fs.writeFileSync(script.path, script.content, 'utf-8')
      return true
    } catch {
      return false
    }
  }

  getSyntaxHighlighting(language) {
    const keywords = {
      javascript: ['const', 'let', 'var', 'function', 'class', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'this', 'import', 'export', 'default', 'async', 'await', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'in', 'of', 'true', 'false', 'null', 'undefined'],
      typescript: ['const', 'let', 'var', 'function', 'class', 'interface', 'type', 'enum', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'this', 'import', 'export', 'default', 'async', 'await', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'in', 'of', 'true', 'false', 'null', 'undefined', 'public', 'private', 'protected', 'readonly', 'static', 'abstract', 'implements', 'extends', 'super'],
      python: ['def', 'class', 'return', 'if', 'else', 'elif', 'for', 'while', 'do', 'break', 'continue', 'import', 'from', 'as', 'try', 'except', 'finally', 'raise', 'with', 'yield', 'lambda', 'pass', 'and', 'or', 'not', 'in', 'is', 'None', 'True', 'False', 'self', 'async', 'await'],
      csharp: ['using', 'namespace', 'class', 'public', 'private', 'protected', 'internal', 'static', 'virtual', 'override', 'abstract', 'sealed', 'partial', 'interface', 'struct', 'enum', 'delegate', 'event', 'return', 'if', 'else', 'for', 'foreach', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'this', 'base', 'null', 'true', 'false', 'void', 'int', 'float', 'double', 'string', 'bool', 'var', 'dynamic', 'object', 'async', 'await', 'try', 'catch', 'finally', 'throw', 'using', 'namespace', 'get', 'set']
    }

    const builtins = {
      javascript: ['console', 'window', 'document', 'Math', 'JSON', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Date', 'RegExp', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol', 'Proxy', 'Reflect', 'Error'],
      typescript: ['console', 'window', 'document', 'Math', 'JSON', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Date', 'RegExp', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol', 'Proxy', 'Reflect', 'Error', 'Vector3', 'GameObject', 'Component'],
      python: ['print', 'len', 'range', 'list', 'dict', 'set', 'tuple', 'str', 'int', 'float', 'bool', 'type', 'isinstance', 'hasattr', 'getattr', 'setattr', 'input', 'open', 'abs', 'max', 'min', 'sum', 'sorted', 'enumerate', 'zip', 'map', 'filter', 'any', 'all'],
      csharp: ['Console', 'Debug', 'Mathf', 'Vector3', 'Quaternion', 'GameObject', 'Component', 'Transform', 'MonoBehaviour', ' MonoBehaviour', 'Start', 'Update', 'FixedUpdate', 'LateUpdate', 'OnCollisionEnter', 'OnTriggerEnter', 'OnDestroy', 'Instantiate', 'Destroy', 'Find', 'GetComponent']
    }

    return {
      keywords: keywords[language] || [],
      builtins: builtins[language] || [],
      comments: {
        javascript: { single: '//', multi: ['/*', '*/'] },
        typescript: { single: '//', multi: ['/*', '*/'] },
        python: { single: '#', multi: null },
        csharp: { single: '//', multi: ['/*', '*/'] }
      }[language] || { single: '//', multi: ['/*', '*/'] }
    }
  }

  highlightCode(code, language) {
    const rules = this.getSyntaxHighlighting(language)
    let highlighted = this.escapeHtml(code)

    const patterns = [
      { regex: /(\/\/.*$|\/\*[\s\S]*?\*\/|#.*$)/gm, class: 'token-comment' },
      { regex: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, class: 'token-string' },
      { regex: /\b(\d+(?:\.\d+)?)\b/g, class: 'token-number' },
      { regex: new RegExp(`\\b(${rules.keywords.join('|')})\\b`, 'g'), class: 'token-keyword' },
      { regex: new RegExp(`\\b(${rules.builtins.join('|')})\\b`, 'g'), class: 'token-builtin' },
      { regex: /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()/g, class: 'token-function' }
    ]

    patterns.forEach(pattern => {
      highlighted = highlighted.replace(pattern.regex, match => {
        if (pattern.class === 'token-comment') {
          return `<span class="${pattern.class}">${match}</span>`
        }
        return `<span class="${pattern.class}">${match}</span>`
      })
    })

    return highlighted
  }

  escapeHtml(text) {
    const div = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }
    return text.replace(/[&<>"']/g, char => div[char])
  }

  getScriptStats(scriptId) {
    const script = this.scripts.get(scriptId)
    if (!script) return null

    const lines = script.content.split('\n')
    const stats = {
      lines: lines.length,
      characters: script.content.length,
      words: script.content.split(/\s+/).filter(w => w.length > 0).length,
      language: script.language,
      size: Buffer.byteLength(script.content, 'utf-8')
    }

    return stats
  }

  validateScript(scriptId, language) {
    const script = this.scripts.get(scriptId)
    if (!script) return { valid: false, errors: ['Script not found'] }

    const errors = []
    const lines = script.content.split('\n')

    lines.forEach((line, index) => {
      const lineNumber = index + 1

      if (language === 'javascript' || language === 'typescript') {
        const openBraces = (line.match(/\{/g) || []).length
        const closeBraces = (line.match(/\}/g) || []).length
        if (openBraces > 1 || closeBraces > 1) {
          errors.push({ line: lineNumber, message: 'Multiple braces on single line' })
        }
      }

      if (language === 'python') {
        const trimmed = line.trim()
        if (trimmed.length > 0 && trimmed[0] === ' ') {
          const indent = line.length - line.trimStart().length
          if (indent % 4 !== 0 && indent !== 0) {
            errors.push({ line: lineNumber, message: 'Inconsistent indentation (use 4 spaces)' })
          }
        }
      }
    })

    return {
      valid: errors.length === 0,
      errors,
      stats: this.getScriptStats(scriptId)
    }
  }

  getIpcHandlers() {
    return {
      'script-create': async (_event, name, content, language) => this.createScript(name, content, language),
      'script-load': async (_event, scriptPath) => this.loadScript(scriptPath),
      'script-save': async (_event, scriptId) => this.saveScript(scriptId),
      'script-update': async (_event, scriptId, content) => this.updateScriptContent(scriptId, content),
      'script-delete': async (_event, scriptId) => this.deleteScript(scriptId),
      'script-get': async (_event, scriptId) => this.getScript(scriptId),
      'script-list': async () => this.getAllScripts(),
      'script-scan': async () => this.scanScriptDirectory(),
      'script-validate': async (_event, scriptId, language) => this.validateScript(scriptId, language),
      'script-stats': async (_event, scriptId) => this.getScriptStats(scriptId),
      'script-highlight': async (_event, code, language) => this.highlightCode(code, language)
    }
  }
}

module.exports = new ScriptEditor()
