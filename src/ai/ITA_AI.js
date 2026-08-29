const EventEmitter = require('events')
const path = require('path')
const fs = require('fs')

class AIProvider {
  constructor(name, config = {}) {
    this.name = name
    this.config = config
    this.enabled = true
  }

  async generate(prompt, options = {}) {
    throw new Error('Provider does not implement generate')
  }

  async chat(messages, options = {}) {
    throw new Error('Provider does not implement chat')
  }

  async healthCheck() {
    return { available: false, error: 'Not implemented' }
  }
}

class OllamaProvider extends AIProvider {
  constructor(config = {}) {
    super('ollama', config)
    this.endpoint = config.endpoint || 'http://localhost:11434'
    this.model = config.model || process.env.ITA_OLLAMA_MODEL || 'llama2'
    this.timeout = config.timeout || 60000
    this._resolvedModel = null
    // Ordem de preferência quando o modelo configurado não está instalado
    this.preferredModels = [
      'qwen2.5-coder',
      'llama3.1',
      'llama3.2',
      'llama3',
      'mistral'
    ]
  }

  /* Resolve o modelo a usar: o configurado (se instalado) ou o melhor
     disponível no Ollama — evita "Ollama error: 404" em instalações
     que não possuem o modelo padrão. Cache por processo. */
  async resolveModel(options = {}) {
    if (options.model) return options.model
    if (this._resolvedModel) return this._resolvedModel

    try {
      const health = await this.healthCheck()

      if (health.available && Array.isArray(health.models) && health.models.length > 0) {
        if (health.models.includes(this.model)) {
          this._resolvedModel = this.model
        } else {
          const preferred = this.preferredModels.find(p =>
            health.models.some(m => m === p || m.startsWith(p + ':'))
          )
          this._resolvedModel = preferred
            ? health.models.find(m => m === preferred || m.startsWith(preferred + ':'))
            : health.models[0]
        }

        if (this._resolvedModel !== this.model) {
          console.warn(
            `[ITA_AI] Modelo "${this.model}" não instalado no Ollama — usando "${this._resolvedModel}"` +
            ` (defina ITA_OLLAMA_MODEL ou puxe com: ollama pull ${this.model})`
          )
        }

        return this._resolvedModel
      }
    } catch {
      // healthCheck falhou → mantém o modelo configurado
      // (generate/chat reportarão o erro original)
    }

    return this.model
  }

  async generate(prompt, options = {}) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)

      const modelName = await this.resolveModel(options)

      const response = await fetch(`${this.endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          prompt,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens || 1024
          }
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`)
      }

      const data = await response.json()
      return { text: data.response, model: modelName, provider: 'ollama' }
    } catch (error) {
      return { text: '', error: error.message, provider: 'ollama' }
    }
  }

  async chat(messages, options = {}) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)

      const modelName = await this.resolveModel(options)

      const response = await fetch(`${this.endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          messages,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens || 1024
          }
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`)
      }

      const data = await response.json()
      return { text: data.message.content, model: modelName, provider: 'ollama' }
    } catch (error) {
      return { text: '', error: error.message, provider: 'ollama' }
    }
  }

  async healthCheck() {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(`${this.endpoint}/api/tags`, {
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Ollama not available: ${response.status}`)
      }

      const data = await response.json()
      return {
        available: true,
        models: data.models?.map(m => m.name) || [],
        currentModel: this.model
      }
    } catch (error) {
      return { available: false, error: error.message }
    }
  }

  async listModels() {
    const health = await this.healthCheck()
    if (!health.available) return []
    return health.models
  }
}

class ITAAI extends EventEmitter {
  constructor() {
    super()
    this.providers = new Map()
    this.activeProvider = null
    this.conversations = new Map()
    this.context = {
      currentProject: null,
      currentScene: null,
      selectedObject: null,
      recentActions: [],
      suggestions: []
    }
    this.registerDefaultProviders()
  }

  registerDefaultProviders() {
    this.registerProvider('ollama', new OllamaProvider())
  }

  registerProvider(name, provider) {
    if (!(provider instanceof AIProvider)) {
      throw new Error('Provider must extend AIProvider')
    }
    this.providers.set(name, provider)
    if (!this.activeProvider) {
      this.activeProvider = name
    }
  }

  setActiveProvider(name) {
    if (!this.providers.has(name)) {
      throw new Error(`Provider ${name} not found`)
    }
    this.activeProvider = name
    this.emit('providerChanged', name)
  }

  getProvider() {
    return this.providers.get(this.activeProvider)
  }

  async generateCode(prompt, context = {}) {
    const fullPrompt = this.buildCodePrompt(prompt, context)
    const result = await this.getProvider().generate(fullPrompt, {
      temperature: 0.3,
      maxTokens: 2048
    })

    if (result.error) {
      return { success: false, error: result.error }
    }

    return {
      success: true,
      code: this.extractCode(result.text),
      explanation: this.extractExplanation(result.text),
      raw: result.text
    }
  }

  async explainCode(code, language = 'javascript') {
    const prompt = `Explain this ${language} code in detail:\n\`\`\`${language}\n${code}\n\`\`\`\n\nProvide a clear explanation of what it does, how it works, and any potential issues.`
    const result = await this.getProvider().generate(prompt, { temperature: 0.5 })
    return { success: true, explanation: result.text }
  }

  async refactorCode(code, instructions, language = 'javascript') {
    const prompt = `Refactor this ${language} code according to these instructions: ${instructions}\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nReturn only the refactored code with improvements applied.`
    const result = await this.getProvider().generate(prompt, { temperature: 0.3 })
    return { success: true, code: this.extractCode(result.text), raw: result.text }
  }

  async createScene(objects, environment = 'default') {
    const prompt = `Create a complete 3D scene with the following objects: ${objects.join(', ')}. Environment: ${environment}. Include positions, scales, rotations, and basic materials.`
    const result = await this.getProvider().generate(prompt, { temperature: 0.7, maxTokens: 4096 })
    return { success: true, scene: this.parseSceneResponse(result.text), raw: result.text }
  }

  async createScript(type, requirements) {
    const prompt = `Create a ${type} script for a game engine with these requirements: ${requirements}\n\nInclude proper event handling, update loop, and error handling.`
    const result = await this.getProvider().generate(prompt, { temperature: 0.4, maxTokens: 4096 })
    return { success: true, script: this.extractCode(result.text), explanation: this.extractExplanation(result.text), raw: result.text }
  }

  async createPhysics(config) {
    const prompt = `Create physics configuration for: ${config.type}\n\nRequirements: ${JSON.stringify(config.requirements)}\n\nInclude: mass, drag, friction, collision layers, gravity settings.`
    const result = await this.getProvider().generate(prompt, { temperature: 0.3 })
    return { success: true, physics: this.parseJSON(result.text), raw: result.text }
  }

  async debugCode(code, error, language = 'javascript') {
    const prompt = `Debug this ${language} code that has the following error:\n\nError: ${error}\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nProvide the fixed code and explanation of what was wrong.`
    const result = await this.getProvider().generate(prompt, { temperature: 0.2 })
    return { success: true, fixedCode: this.extractCode(result.text), explanation: this.extractExplanation(result.text), raw: result.text }
  }

  async optimizeCode(code, language = 'javascript') {
    const prompt = `Optimize this ${language} code for performance:\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nReturn the optimized version with performance improvements and explain what was optimized.`
    const result = await this.getProvider().generate(prompt, { temperature: 0.3 })
    return { success: true, optimizedCode: this.extractCode(result.text), improvements: this.extractExplanation(result.text), raw: result.text }
  }

  async generateDocumentation(code, language = 'javascript') {
    const prompt = `Generate comprehensive documentation for this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nInclude: description, parameters, return values, examples, and usage instructions.`
    const result = await this.getProvider().generate(prompt, { temperature: 0.4 })
    return { success: true, documentation: result.text }
  }

  async chat(message, history = []) {
    const contextPrompt = this.buildContextPrompt()
    const messages = [
      { role: 'system', content: contextPrompt },
      ...history,
      { role: 'user', content: message }
    ]

    const result = await this.getProvider().chat(messages, { temperature: 0.7 })

    if (result.error) {
      return { success: false, error: result.error }
    }

    this.context.recentActions.push({
      type: 'chat',
      message,
      response: result.text,
      timestamp: Date.now()
    })

    return { success: true, response: result.text }
  }

  buildCodePrompt(prompt, context) {
    let systemPrompt = `You are ITA AI, an expert game development assistant. Help with:\n`
    systemPrompt += `- Game engine architecture\n`
    systemPrompt += `- 3D scene creation\n`
    systemPrompt += `- Physics systems\n`
    systemPrompt += `- Shader programming\n`
    systemPrompt += `- Game scripting\n`
    systemPrompt += `- Performance optimization\n`
    systemPrompt += `- Debugging and testing\n\n`

    if (context.project) {
      systemPrompt += `Current project: ${context.project}\n`
    }
    if (context.scene) {
      systemPrompt += `Current scene: ${context.scene}\n`
    }
    if (context.language) {
      systemPrompt += `Preferred language: ${context.language}\n`
    }

    systemPrompt += `\nUser request: ${prompt}\n\nProvide complete, production-ready code with comments.`

    return systemPrompt
  }

  buildContextPrompt() {
    let prompt = `You are ITA AI, a professional game development assistant integrated into ITA Browser Game Studio.\n`
    prompt += `You help developers create games, simulators, and 3D applications.\n\n`

    if (this.context.currentProject) {
      prompt += `Current project: ${this.context.currentProject}\n`
    }
    if (this.context.currentScene) {
      prompt += `Current scene: ${this.context.currentScene}\n`
    }
    if (this.context.selectedObject) {
      prompt += `Selected object: ${this.context.selectedObject.name} (${this.context.selectedObject.type})\n`
    }

    prompt += `\nProvide practical, executable solutions. Include code examples when relevant.`

    return prompt
  }

  extractCode(text) {
    const matches = text.match(/```[\w]*\n([\s\S]*?)```/)
    return matches ? matches[1].trim() : text.trim()
  }

  extractExplanation(text) {
    const codeMatch = text.match(/```[\w]*\n[\s\S]*?```/)
    if (codeMatch) {
      return text.replace(codeMatch[0], '').trim()
    }
    return text.trim()
  }

  parseSceneResponse(text) {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
    } catch {
      // ignore
    }
    return { raw: text }
  }

  parseJSON(text) {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
    } catch {
      // ignore
    }
    return null
  }

  updateContext(key, value) {
    this.context[key] = value
    this.emit('contextUpdated', { key, value })
  }

  getContext() {
    return { ...this.context }
  }

  async checkProviders() {
    const results = {}
    for (const [name, provider] of this.providers) {
      results[name] = await provider.healthCheck()
    }
    return results
  }

  getIpcHandlers() {
    return {
      'ai-chat': async (_event, message, history) => this.chat(message, history || []),
      'ai-generate-code': async (_event, prompt, context) => this.generateCode(prompt, context || {}),
      'ai-explain-code': async (_event, code, language) => this.explainCode(code, language),
      'ai-refactor-code': async (_event, code, instructions, language) => this.refactorCode(code, instructions, language),
      'ai-create-scene': async (_event, objects, environment) => this.createScene(objects, environment),
      'ai-create-script': async (_event, type, requirements) => this.createScript(type, requirements),
      'ai-create-physics': async (_event, config) => this.createPhysics(config),
      'ai-debug-code': async (_event, code, error, language) => this.debugCode(code, error, language),
      'ai-optimize-code': async (_event, code, language) => this.optimizeCode(code, language),
      'ai-documentation': async (_event, code, language) => this.generateDocumentation(code, language),
      'ai-check-providers': async () => this.checkProviders(),
      'ai-set-provider': async (_event, name) => this.setActiveProvider(name),
      'ai-get-context': async () => this.getContext(),
      'ai-update-context': async (_event, key, value) => this.updateContext(key, value)
    }
  }
}

module.exports = new ITAAI()
