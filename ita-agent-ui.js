/* =========================================================
   ITA AI — UI do Agente de Engenharia
   Conecta o Agent Core (main) à interface do navegador
   ========================================================= */

const AI_AGENT_UI = {

  downloadItems: new Map(),

  init() {
    if (!window.itaAgent) return

    window.itaAgent.onAgentEvent(event => this.handleAgentEvent(event))

    if (window.itaBrowserAPI) {
      window.itaBrowserAPI.onDownloadStarted(data => this.onDownloadStarted(data))
      window.itaBrowserAPI.onDownloadProgress(data => this.onDownloadProgress(data))
      window.itaBrowserAPI.onDownloadDone(data => this.onDownloadDone(data))
      window.itaBrowserAPI.onSecurityBlock(verdict => this.showSecurityToast(verdict, true))
      window.itaBrowserAPI.onSecurityWarning(verdict => this.showSecurityToast(verdict, false))
    }

    this.refreshApprovalsQuiet()
    this.refreshOptimizer()
  },

  /* ---------- Abas ---------- */

  switchAiTab(name) {
    document.querySelectorAll('.ai-tab').forEach(tab => tab.classList.remove('active'))
    document.querySelectorAll('.ai-pane').forEach(pane => pane.classList.remove('active'))

    const tab = document.getElementById(`tab-${name}`)
    const pane = document.getElementById(`pane-${name}`)
    if (tab) tab.classList.add('active')
    if (pane) pane.classList.add('active')

    if (name === 'memory') this.loadMemory()
    if (name === 'optimizer') this.refreshOptimizer()
  },

  /* ---------- Eventos do agente ---------- */

  handleAgentEvent(event) {
    if (!event) return

    if (event.type === 'log') {
      this.appendLog(event.payload.message, event.payload.level)
    } else if (event.type === 'plan') {
      this.renderPlan(event.payload)
    } else if (event.type === 'approval-request') {
      this.renderApprovals()
    } else if (event.type === 'step-update' || event.type === 'step-start') {
      this.updatePlanStep(event.payload)
    } else if (event.type === 'verification') {
      const icon = event.payload.passed ? '✅' : '❌'
      this.appendLog(`${icon} Verificação: ${event.payload.results.map(r => `${r.check}=${r.passed ? 'ok' : 'falha'}`).join(', ')}`, event.payload.passed ? 'success' : 'error')
    } else if (event.type === 'cycle-complete') {
      this.appendLog(`🏁 Ciclo: ${event.payload.stepsCompleted}/${event.payload.stepsTotal} passos`, event.payload.success ? 'success' : 'warn')
    }

    this.refreshApprovalsQuiet()
  },

  appendLog(message, level = 'info') {
    const log = document.getElementById('agentLog')
    if (!log) return
    const line = document.createElement('div')
    line.className = `agent-log-line ${level}`
    line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`
    log.appendChild(line)
    log.scrollTop = log.scrollHeight
  },

  /* ---------- Ações principais ---------- */

  async agentObserve() {
    this.appendLog('👁️ Observando o projeto...')
    const snapshot = await window.itaAgent.observe()
    if (snapshot) {
      this.appendLog(`📊 ${snapshot.files.count} arquivos, ${snapshot.files.totalLines} linhas, Ollama ${snapshot.ollama.running ? 'online' : 'offline'}`)
    }
  },

  async agentAnalyze() {
    this.appendLog('🔍 Analisando código...')
    const result = await window.itaAgent.analyze()
    if (result && result.report) {
      this.appendLog(`🚦 Saúde: ${result.report.score}/100 (${result.report.health}) — ${result.analysis.totalFindings} achados`, result.report.score >= 75 ? 'success' : 'warn')
    }
  },

  async agentRunCycle() {
    const input = document.getElementById('agentGoal')
    const goal = input && input.value.trim() ? input.value.trim() : null
    this.appendLog('🚀 Iniciando ciclo completo...')
    const result = await window.itaAgent.runCycle(goal)
    if (result && result.paused) {
      this.appendLog('⏸️ Aguardando sua aprovação nos cartões acima.', 'warn')
    }
  },

  /* ---------- Plano ---------- */

  renderPlan(plan) {
    const container = document.getElementById('agentPlan')
    if (!container || !plan) return
    container.innerHTML = ''

    const title = document.createElement('div')
    title.className = 'agent-log-line success'
    title.textContent = `🗺️ ${plan.objective} (${plan.source === 'ollama' ? 'Ollama' : 'heurístico'})`
    container.appendChild(title)

    for (const step of plan.steps) {
      container.appendChild(this.buildStepElement(step))
    }
  },

  buildStepElement(step) {
    const el = document.createElement('div')
    el.className = `plan-step ${step.status}`
    el.dataset.stepId = step.id

    const icons = { analyze: '🔍', command: '⌨️', edit: '✏️', verify: '🧪' }
    const statusIcons = { pending: '○', running: '⏳', done: '✓', failed: '✗', 'awaiting-approval': '⏸' }

    const status = document.createElement('span')
    status.className = 'status'
    status.textContent = statusIcons[step.status] || '○'

    const label = document.createElement('span')
    label.textContent = `${icons[step.type] || '•'} ${step.title}`

    el.appendChild(status)
    el.appendChild(label)
    return el
  },

  updatePlanStep(step) {
    if (!step) return
    const el = document.querySelector(`.plan-step[data-step-id="${step.id}"]`)
    if (!el) return
    el.className = `plan-step ${step.status}`
    const statusIcons = { pending: '○', running: '⏳', done: '✓', failed: '✗', 'awaiting-approval': '⏸' }
    el.querySelector('.status').textContent = statusIcons[step.status] || '○'
  },

  /* ---------- Aprovações ---------- */

  async refreshApprovalsQuiet() {
    const container = document.getElementById('agentApprovals')
    if (!container) return
    const status = await window.itaAgent.getStatus()
    this.renderApprovalCards(status.pendingApprovals || [])
  },

  async renderApprovals() {
    await this.refreshApprovalsQuiet()
  },

  renderApprovalCards(approvals) {
    const container = document.getElementById('agentApprovals')
    if (!container) return
    container.innerHTML = ''

    for (const approval of approvals) {
      const card = document.createElement('div')
      card.className = `approval-card ${approval.safety === 'red' ? 'red' : ''}`

      const title = document.createElement('strong')
      title.textContent = `${approval.safety === 'red' ? '🔴' : '🟡'} ${approval.kind === 'command' ? 'Comando' : 'Edição'}: ${approval.title}`
      card.appendChild(title)

      if (approval.command) {
        const cmd = document.createElement('div')
        cmd.className = 'opp-file'
        cmd.textContent = `$ ${approval.command}`
        card.appendChild(cmd)
      }

      if (approval.file) {
        const file = document.createElement('span')
        file.className = 'opp-file'
        file.textContent = `📄 ${approval.file}`
        card.appendChild(file)
      }

      if (approval.diff) {
        const diff = document.createElement('div')
        diff.className = 'diff-box'
        diff.textContent = approval.diff.split('\n').slice(0, 40).join('\n')
        card.appendChild(diff)
      }

      const actions = document.createElement('div')
      actions.className = 'approval-actions'

      const approveBtn = document.createElement('button')
      approveBtn.className = 'agent-btn primary'
      approveBtn.textContent = '✅ Aprovar'
      approveBtn.onclick = async () => {
        approveBtn.disabled = true
        const result = await window.itaAgent.approve(approval.id)
        this.appendLog(result && result.success !== false ? `✅ Aprovado: ${approval.title}` : `❌ Falha na aprovação`, result && result.success !== false ? 'success' : 'error')
        this.renderApprovals()
      }

      const rejectBtn = document.createElement('button')
      rejectBtn.className = 'agent-btn danger'
      rejectBtn.textContent = '🚫 Rejeitar'
      rejectBtn.onclick = async () => {
        rejectBtn.disabled = true
        await window.itaAgent.reject(approval.id, 'Rejeitado pelo usuário')
        this.appendLog(`🚫 Rejeitado: ${approval.title}`, 'warn')
        this.renderApprovals()
      }

      actions.appendChild(approveBtn)
      actions.appendChild(rejectBtn)
      card.appendChild(actions)
      container.appendChild(card)
    }
  },

  /* ---------- Otimizador ---------- */

  async optimizerAnalyze() {
    const list = document.getElementById('optimizerList')
    if (list) list.innerHTML = '<div class="agent-log-line">🚀 Analisando projeto...</div>'
    const result = await window.itaAgent.analyze()
    if (result && result.report) this.renderOptimizer(result.report)
  },

  async refreshOptimizer() {
    const report = await window.itaAgent.getOptimizerReport()
    if (report && report.opportunities && report.opportunities.length > 0) {
      this.renderOptimizer(report)
    }
  },

  renderOptimizer(report) {
    const badge = document.getElementById('healthBadge')
    if (badge) {
      badge.textContent = `Saúde: ${report.score}/100 — ${report.health}`
      badge.className = `health-badge ${report.score >= 75 ? 'good' : report.score >= 50 ? 'mid' : 'bad'}`
    }

    const list = document.getElementById('optimizerList')
    if (!list) return
    list.innerHTML = ''

    const severityLabels = { high: '🔴 Alta', medium: '🟠 Média', low: '🟡 Baixa', suggestion: '💡 Sugestão' }

    for (const opp of report.opportunities) {
      if (opp.status === 'ignored' || opp.status === 'fixed') continue

      const card = document.createElement('div')
      card.className = `opportunity-card ${opp.severity}`

      const title = document.createElement('strong')
      title.textContent = `${severityLabels[opp.severity] || '•'} — ${opp.title}`
      card.appendChild(title)

      const desc = document.createElement('span')
      desc.textContent = opp.description
      card.appendChild(desc)

      if (opp.file) {
        const file = document.createElement('span')
        file.className = 'opp-file'
        file.textContent = `📄 ${opp.file}${opp.line ? ` (linha ${opp.line})` : ''}`
        card.appendChild(file)
      }

      if (opp.status !== 'pending') {
        const status = document.createElement('span')
        status.className = 'opp-status'
        status.textContent = `Status: ${opp.status}`
        card.appendChild(status)
      }

      const actions = document.createElement('div')
      actions.className = 'opp-actions'

      const makeButton = (label, action) => {
        const btn = document.createElement('button')
        btn.textContent = label
        btn.onclick = async () => {
          btn.disabled = true
          this.appendLog(`🤖 Otimizador: ${action} → ${opp.title}`)
          await window.itaAgent.opportunityAction(opp.id, action)
          btn.disabled = false
          this.refreshOptimizer()
        }
        return btn
      }

      actions.appendChild(makeButton('🔍 Analisar', 'analyze'))
      actions.appendChild(makeButton('🗺️ Planejar', 'plan'))
      if (opp.severity !== 'suggestion') {
        actions.appendChild(makeButton('🔧 Corrigir', 'fix'))
      }
      actions.appendChild(makeButton('🔕 Ignorar', 'ignore'))

      card.appendChild(actions)
      list.appendChild(card)
    }

    if (list.children.length === 0) {
      list.innerHTML = '<div class="agent-log-line success">🎉 Nenhuma oportunidade aberta. Projeto em dia!</div>'
    }
  },

  /* ---------- Memória ---------- */

  async loadMemory() {
    const view = document.getElementById('memoryView')
    if (!view) return
    const memory = await window.itaAgent.getMemory()
    if (!memory) {
      view.innerHTML = '<div class="agent-log-line">Memória indisponível.</div>'
      return
    }

    view.innerHTML = ''

    const sections = [
      { title: '📋 Projeto', items: [`${memory.project} — ${memory.architecture}`] },
      { title: '🧭 Decisões', items: (memory.decisions || []).slice(-8).map(d => d.text) },
      { title: '✅ Funcionalidades concluídas', items: (memory.completedFeatures || []).slice(-8).map(f => f.title) },
      { title: '⏳ Pendências', items: (memory.pendingFeatures || []).slice(-8).map(f => f.title) },
      { title: '⚠️ Problemas conhecidos', items: (memory.knownProblems || []).filter(p => !p.resolved).slice(-8).map(p => p.text) },
      { title: '💡 Preferências', items: memory.preferences || [] }
    ]

    for (const section of sections) {
      view.appendChild(this.buildMemorySection(section.title, section.items))
    }

    view.appendChild(this.buildMemorySection('ℹ️ Última análise', [
      memory.lastAnalysis
        ? `${memory.lastAnalysis.score}/100 (${memory.lastAnalysis.health}) em ${new Date(memory.lastAnalysis.at).toLocaleString()}`
        : 'Ainda não analisado'
    ]))
  },

  buildMemorySection(title, items) {
    const box = document.createElement('div')
    box.className = 'memory-section'

    const h4 = document.createElement('h4')
    h4.textContent = `${title} (${items.length})`
    box.appendChild(h4)

    const ul = document.createElement('ul')
    if (items.length === 0) {
      const li = document.createElement('li')
      li.textContent = '—'
      ul.appendChild(li)
    } else {
      for (const item of items) {
        const li = document.createElement('li')
        li.textContent = typeof item === 'string' ? item : JSON.stringify(item)
        ul.appendChild(li)
      }
    }

    box.appendChild(ul)
    return box
  },

  async resetMemory() {
    if (!confirm('Apagar toda a memória do projeto? As decisões e o histórico serão perdidos.')) return
    await window.itaAgent.resetMemory()
    this.loadMemory()
    this.appendLog('🗑️ Memória do projeto resetada', 'warn')
  },

  /* ---------- Downloads (Background) ---------- */

  async loadDownloads() {
    // Downloads são executados em background sem elementos estáticos poluindo a interface
  },

  onDownloadStarted(data) {
    this.downloadItems.set(data.id, { ...data, state: 'progressing' })
    this.appendLog(`⬇️ Download iniciado: ${data.filename}`)
  },

  onDownloadProgress(data) {
    const item = this.downloadItems.get(data.id)
    if (item) Object.assign(item, data)
  },

  onDownloadDone(data) {
    const item = this.downloadItems.get(data.id)
    if (item) {
      item.state = data.state || 'completed'
    }
    const filename = item ? item.filename : (data.filename || data.id)
    this.appendLog(
      data.state === 'completed' ? `✅ Download concluído: ${filename}` : `⚠️ Download ${data.state || 'interrompido'}: ${filename}`,
      data.state === 'completed' ? 'success' : 'warn'
    )
  },

  activeDownloadCount() {
    let count = 0
    for (const item of this.downloadItems.values()) {
      if (item.state === 'progressing') count += 1
    }
    return count
  },

  /* ---------- Painel de Segurança ---------- */

  securityEvents: [],

  showSecurityToast(verdict, blocked) {
    this.securityEvents.push({ ...verdict, blocked, at: new Date().toISOString() })
    if (this.securityEvents.length > 50) this.securityEvents = this.securityEvents.slice(-50)
    this.showSecurityBanner({ ...verdict, safe: blocked ? false : true })
    this.refreshSecurity()
    this.appendLog(
      `${blocked ? '⛔ Bloqueado' : '⚠️ Aviso'}: ${verdict.reason} — ${String(verdict.url || '').slice(0, 70)}`,
      blocked ? 'error' : 'warn'
    )
  },

  refreshSecurity() {
    const info = document.getElementById('securityInfo')
    if (!info) return

    info.innerHTML = ''

    const blocked = this.securityEvents.filter(e => e.blocked)
    const warned = this.securityEvents.filter(e => !e.blocked)

    const makeLine = (text, cls) => {
      const div = document.createElement('div')
      div.className = `agent-log-line ${cls || ''}`
      div.textContent = text
      info.appendChild(div)
    }

    makeLine(`🛡️ Proteção ativa nesta sessão — bloqueios: ${blocked.length}`, 'success')
    makeLine(`⚠️ Avisos exibidos: ${warned.length}`, warned.length > 0 ? 'warn' : '')

    for (const event of blocked.slice(-5)) {
      makeLine(`⛔ ${event.reason} — ${String(event.url).slice(0, 70)}`, 'warn')
    }
  },

  updateDownloadsBadge(_count) {
    // UI minimalista: sem badges ou barras estáticas poluindo a interface
  },

  showSecurityBanner(verdict) {
    const banner = document.getElementById('securityBanner')
    if (!banner) return
    banner.style.display = 'flex'
    const text = document.getElementById('securityBannerText')
    if (text) {
      text.textContent = verdict.safe === false
        ? `⛔ Bloqueado: ${verdict.reason}`
        : `⚠️ Aviso: ${verdict.reason}`
    }
    clearTimeout(this._securityBannerTimer)
    this._securityBannerTimer = setTimeout(() => {
      banner.style.display = 'none'
    }, 8000)
  },

  dismissSecurityBanner() {
    const banner = document.getElementById('securityBanner')
    if (banner) banner.style.display = 'none'
  },

  refreshPlanView() {
    // O plano é atualizado pelos eventos step-update (updatePlanStep)
  }
}

/* ---------- Globais expostas para os onclick do HTML ---------- */

function switchAiTab(name) { AI_AGENT_UI.switchAiTab(name) }
function agentObserve() { AI_AGENT_UI.agentObserve() }
function agentAnalyze() { AI_AGENT_UI.agentAnalyze() }
function agentRunCycle() { AI_AGENT_UI.agentRunCycle() }
function optimizerAnalyze() { AI_AGENT_UI.optimizerAnalyze() }
function loadMemory() { AI_AGENT_UI.loadMemory() }
function resetMemory() { AI_AGENT_UI.resetMemory() }
function dismissSecurityBanner() { AI_AGENT_UI.dismissSecurityBanner() }

document.addEventListener('DOMContentLoaded', () => AI_AGENT_UI.init())
