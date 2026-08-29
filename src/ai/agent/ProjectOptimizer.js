/* =========================================================
   ITA AI — Project Optimizer
   Saúde do projeto (0-100) + oportunidades de melhoria
   ========================================================= */

class ProjectOptimizer {
  constructor(contextEngine, codeAnalyzer, memory) {
    this.context = contextEngine
    this.analyzer = codeAnalyzer
    this.memory = memory
    this.lastReport = null
  }

  severityWeight(severity) {
    return { high: 9, medium: 4, low: 1.5, suggestion: 0.5 }[severity] || 1
  }

  healthLabel(score) {
    if (score >= 90) return 'Excelente'
    if (score >= 75) return 'Boa'
    if (score >= 60) return 'Atenção'
    if (score >= 40) return 'Crítica'
    return 'Emergencial'
  }

  opportunityFromFinding(finding) {
    const severityMap = { high: 'high', medium: 'medium', low: 'low' }
    const titles = {
      'empty-catch': 'Tratamento de erro ausente',
      'risky-parse': 'JSON.parse sem proteção',
      'eval-usage': 'Risco de segurança: eval()',
      'inner-html': 'Risco de XSS via innerHTML',
      'broken-require': 'Arquivo/requisição quebrada',
      'duplicate-function': 'Código duplicado entre arquivos',
      'large-file': 'Arquivo grande demais',
      'todo': 'Tarefa pendente no código',
      'no-test-script': 'Faltam testes automatizados',
      'no-build-script': 'Falta script de build',
      'no-git': 'Sem controle de versão (Git)',
      'temp-files': 'Arquivos temporários na raiz',
      'var-usage': 'Uso de var (padrão antigo)',
      'loose-equality': 'Comparação frouxa (==)',
      'blank-without-noopener': 'Link inseguro (target=_blank)',
      'img-without-alt': 'Acessibilidade: imagem sem alt'
    }
    return {
      id: finding.id,
      severity: severityMap[finding.severity] || 'suggestion',
      title: titles[finding.type] || finding.type,
      description: finding.message,
      file: finding.file,
      line: finding.line,
      action: finding.suggestion || 'Analisar e corrigir',
      type: finding.type,
      status: 'pending',
      detectedAt: new Date().toISOString()
    }
  }

  featureSuggestions() {
    const completed = (this.memory.data.completedFeatures || []).map(f => f.title.toLowerCase())
    const suggestions = []
    const candidates = [
      { key: 'restauração de sessão', title: 'Restauração automática das abas ao reabrir o navegador' },
      { key: 'downloads', title: 'Gerenciamento de downloads com progresso' },
      { key: 'páginas maliciosas', title: 'Proteção contra páginas maliciosas (verificação de URL)' },
      { key: 'histórico', title: 'Painel de histórico de navegação' },
      { key: 'atualização', title: 'Verificação periódica de atualização do projeto' }
    ]
    for (const candidate of candidates) {
      const done = completed.some(title => title.includes(candidate.key))
      if (!done) {
        suggestions.push({
          id: `suggestion:${candidate.key.replace(/\s+/g, '-')}`,
          severity: 'suggestion',
          title: 'Sugestão de nova funcionalidade',
          description: candidate.title,
          action: 'Planejar e implementar esta funcionalidade',
          type: 'feature-suggestion',
          status: 'pending',
          detectedAt: new Date().toISOString()
        })
      }
    }
    return suggestions.slice(0, 3)
  }

  async analyze(contextSnapshot, analysisResult) {
    const snapshot = contextSnapshot || await this.context.observe()
    const analysis = analysisResult || await this.analyzer.analyze(snapshot)

    const findings = (analysis.findings || [])
    const opportunities = findings.map(f => this.opportunityFromFinding(f))

    // Preservar status anterior das oportunidades conhecidas
    const previous = new Map((this.memory.data.opportunities || []).map(o => [o.id, o]))
    for (const opportunity of opportunities) {
      const old = previous.get(opportunity.id)
      if (old && ['planned', 'ignored', 'fixed'].includes(old.status)) {
        if (old.status === 'fixed' && old.statusAt && old.detectedAt !== old.statusAt) {
          opportunity.status = 'pending' // voltou a aparecer depois da correção
        } else if (old.status !== 'fixed') {
          opportunity.status = old.status
          if (old.statusAt) opportunity.statusAt = old.statusAt
        }
      }
    }

    const suggestions = this.featureSuggestions().map(s => {
      const old = previous.get(s.id)
      return old && ['ignored', 'planned'].includes(old.status) ? { ...s, status: old.status } : s
    })

    // A lista da memória é sempre a da análise mais recente (sem acúmulo)
    const all = [...opportunities, ...suggestions]
    this.memory.replaceOpportunities(all)

    const openItems = all.filter(o => o.status === 'pending' || o.status === 'planned')

    // Score normalizado por tamanho do projeto (penalidade por mil linhas)
    const kloc = Math.max(1, snapshot.files.totalLines / 1000)
    const rawWeight = openItems.reduce((sum, item) => sum + this.severityWeight(item.severity), 0)
    const perKloc = rawWeight / kloc
    const penalty = Math.min(60, perKloc * 5)

    let score = 100
    score -= penalty
    if (snapshot.localServer && !snapshot.localServer.running) score -= 3
    if (snapshot.ollama && !snapshot.ollama.running) score -= 2
    score = Math.max(5, Math.min(100, Math.round(score)))

    const report = {
      generatedAt: new Date().toISOString(),
      score,
      health: this.healthLabel(score),
      counts: {
        high: openItems.filter(o => o.severity === 'high').length,
        medium: openItems.filter(o => o.severity === 'medium').length,
        low: openItems.filter(o => o.severity === 'low').length,
        suggestion: openItems.filter(o => o.severity === 'suggestion').length
      },
      totalOpen: openItems.length,
      opportunities: all
    }

    this.lastReport = report
    this.memory.setLastAnalysis({ score, health: report.health, totalFindings: analysis.totalFindings, counts: report.counts })
    return report
  }

  markStatus(id, status) {
    this.memory.updateOpportunityStatus(id, status)
    if (this.lastReport) {
      const item = this.lastReport.opportunities.find(o => o.id === id)
      if (item) item.status = status
    }
    return { success: true, id, status }
  }

  getReport() {
    if (this.lastReport) return this.lastReport
    const stored = this.memory.data.opportunities || []
    const openItems = stored.filter(o => o.status === 'pending' || o.status === 'planned')
    let score = 100
    for (const item of openItems) score -= this.severityWeight(item.severity)
    score = Math.max(5, Math.min(100, Math.round(score)))
    this.lastReport = {
      generatedAt: this.memory.data.lastAnalysis ? this.memory.data.lastAnalysis.at : null,
      score,
      health: this.healthLabel(score),
      totalOpen: openItems.length,
      opportunities: stored
    }
    return this.lastReport
  }
}

module.exports = ProjectOptimizer
