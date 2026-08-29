/* =========================================================
   ITA AI — Planner
   Nível 3: Planejar antes de agir
   Usa o Ollama quando disponível; senão, heurística local.
   ========================================================= */

class Planner {
  constructor(contextEngine, aiProvider) {
    this.context = contextEngine
    this.ai = aiProvider
  }

  normalizeStep(rawStep, index) {
    const types = ['analyze', 'command', 'edit', 'verify']
    const type = types.includes(rawStep.type) ? rawStep.type : 'analyze'
    const safety = ['green', 'yellow', 'red'].includes(rawStep.safety) ? rawStep.safety : (type === 'command' ? 'yellow' : 'green')
    return {
      id: `step-${index + 1}`,
      index,
      type,
      title: String(rawStep.title || rawStep.description || `Passo ${index + 1}`).slice(0, 160),
      description: String(rawStep.description || rawStep.title || '').slice(0, 500),
      command: typeof rawStep.command === 'string' ? rawStep.command.slice(0, 300) : null,
      file: typeof rawStep.file === 'string' ? rawStep.file.slice(0, 300) : null,
      content: typeof rawStep.content === 'string' ? rawStep.content : null,
      safety,
      status: 'pending',
      result: null
    }
  }

  heuristicPlan(goal, analysis) {
    const steps = []
    const findings = (analysis && analysis.findings) || []
    const priority = { high: 0, medium: 1, low: 2 }
    const relevant = findings
      .filter(f => f.severity !== 'low')
      .sort((a, b) => priority[a.severity] - priority[b.severity])
      .slice(0, 6)

    steps.push(this.normalizeStep({
      type: 'analyze',
      title: 'Observar estado atual do projeto',
      description: 'Coletar snapshot de arquivos, dependências, Git e serviços antes de qualquer alteração'
    }, steps.length))

    for (const finding of relevant) {
      if (finding.type === 'no-test-script' || finding.type === 'no-build-script') {
        // Correção determinística conhecida: package.json
        steps.push(this.normalizeStep({
          type: 'edit',
          title: `Corrigir "${finding.type}" no package.json`,
          description: finding.suggestion,
          file: 'package.json',
          safety: 'yellow'
        }, steps.length))
      } else if (finding.type === 'no-git') {
        steps.push(this.normalizeStep({
          type: 'command',
          title: 'Inicializar repositório Git',
          description: 'git init para controle de versão',
          command: 'git init',
          safety: 'yellow'
        }, steps.length))
      } else {
        // Sem correção determinística: vira passo de investigação (nunca edita às cegas)
        steps.push(this.normalizeStep({
          type: 'analyze',
          title: `Investigar: ${finding.message}`.slice(0, 150),
          description: `${finding.suggestion || 'Analisar o problema'}${finding.file ? ` (em ${finding.file}${finding.line ? `:${finding.line}` : ''})` : ''}`
        }, steps.length))
      }
    }

    steps.push(this.normalizeStep({
      type: 'verify',
      title: 'Verificar alterações',
      description: 'Rodar verificação de sintaxe, testes e build, e registrar o resultado na memória'
    }, steps.length))

    return {
      objective: String(goal || 'Melhorar o projeto').slice(0, 300),
      source: 'heuristic',
      createdAt: new Date().toISOString(),
      steps
    }
  }

  buildPrompt(goal, snapshot, analysis, memory) {
    const summary = {
      objetivo: goal,
      projeto: snapshot.package,
      arquivosMaiores: snapshot.files.largest,
      git: snapshot.git.isRepo ? `branch ${snapshot.git.branch}, ${snapshot.git.changedFiles} alterações` : 'sem git',
      problemas: (analysis.findings || []).slice(0, 10).map(f => ({ severidade: f.severity, tipo: f.type, arquivo: f.file, mensagem: f.message })),
      decisoesAnteriores: (memory.decisions || []).slice(-5).map(d => d.text),
      funcionalidadesConcluidas: (memory.completedFeatures || []).slice(-8).map(f => f.title)
    }

    return [
      'Você é o Planner da ITA AI, agente de engenharia do ITA Browser (Electron).',
      'Responda APENAS com um JSON válido, sem texto extra, no formato:',
      '{"objective":"...","steps":[{"type":"analyze|command|edit|verify","title":"...","description":"...","command":"npm test (só se type=command)","file":"caminho/relativo (só se type=edit)","safety":"green|yellow|red"}]}',
      'Regras: máximo 8 passos; incluir sempre um passo final type=verify;',
      'comandos permitidos apenas com prefixos: node, npm, git, ollama, dir, type, where, echo;',
      'type=edit exige file e descreve a mudança no description (o conteúdo será decidido na execução);',
      'passos destrutivos são proibidos (safety red).',
      '',
      `Estado do projeto: ${JSON.stringify(summary)}`
    ].join('\n')
  }

  extractJson(text) {
    if (!text) return null
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    const candidate = fenced ? fenced[1] : text
    const match = candidate.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }

  async createPlan(goal, snapshot, analysis, memory) {
    if (this.ai && typeof this.ai.getProvider === 'function') {
      try {
        const provider = this.ai.getProvider()
        if (provider) {
          const health = await provider.healthCheck()
          if (health && health.available) {
            const prompt = this.buildPrompt(goal, snapshot, analysis, memory)
            const response = await provider.chat([
              { role: 'system', content: 'Você é um planejador de engenharia. Responda apenas JSON válido.' },
              { role: 'user', content: prompt }
            ], { temperature: 0.2, maxTokens: 1200 })

            if (response && response.text && !response.error) {
              const parsed = this.extractJson(response.text)
              if (parsed && Array.isArray(parsed.steps) && parsed.steps.length > 0) {
                const steps = parsed.steps.slice(0, 8).map((step, index) => this.normalizeStep(step, index))
                if (!steps.some(s => s.type === 'verify')) {
                  steps.push(this.normalizeStep({ type: 'verify', title: 'Verificar alterações' }, steps.length))
                }
                return {
                  objective: String(parsed.objective || goal).slice(0, 300),
                  source: 'ollama',
                  model: health.currentModel || null,
                  createdAt: new Date().toISOString(),
                  steps
                }
              }
            }
          }
        }
      } catch {
        // cai no heurístico
      }
    }

    return this.heuristicPlan(goal, analysis)
  }
}

module.exports = Planner
