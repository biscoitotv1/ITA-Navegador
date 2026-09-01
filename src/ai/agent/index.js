/* =========================================================
   ITA AI — Agent (integração)
   Junta todos os módulos e expõe handlers IPC
   ========================================================= */

const fs = require('fs')
const path = require('path')

const ProjectMemory = require('./ProjectMemory')
const ContextEngine = require('./ContextEngine')
const CodeAnalyzer = require('./CodeAnalyzer')
const ErrorAnalyzer = require('./ErrorAnalyzer')
const CommandRunner = require('./CommandRunner')
const EditApplier = require('./EditApplier')
const TestRunner = require('./TestRunner')
const Planner = require('./Planner')
const ProjectOptimizer = require('./ProjectOptimizer')
const AgentCore = require('./AgentCore')

const projectRoot = path.join(__dirname, '..', '..', '..')

const memory = new ProjectMemory(path.join(projectRoot, '.ita-agent'))
const context = new ContextEngine(projectRoot)
const analyzer = new CodeAnalyzer(context)
const errorAnalyzer = new ErrorAnalyzer(context)
const runner = new CommandRunner(projectRoot)
const editor = new EditApplier(projectRoot, path.join(projectRoot, '.ita-agent', 'backups'))
const tester = new TestRunner(runner, context)

// O provider de IA é injetado depois (evita dependência circular com src/ai/ITA_AI.js)
let aiProvider = null
const planner = new Planner(context, {
  getProvider: () => aiProvider
})

const optimizer = new ProjectOptimizer(context, analyzer, memory)
const agent = new AgentCore({ memory, context, analyzer, optimizer, planner, runner, editor, tester, errorAnalyzer })

function setAiProvider(provider) {
  aiProvider = provider
}

function setMainWindow(win) {
  agent.setWindow(win)
}

/* =========================================================
   Semeia a memória com funcionalidades que JÁ existem
   (detectadas por marcadores reais no código, não por "achismo")
   para o Project Optimizer não sugerir o que já está pronto.
   ========================================================= */
function seedBuiltInFeatures() {
  try {
    const mainSource = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf-8')

    const builtIn = [
      { marker: "session.on('will-download'", key: 'downloads', title: 'Gerenciador de downloads com progresso' },
      { marker: 'evaluateUrlSafety', key: 'páginas maliciosas', title: 'Proteção contra páginas maliciosas (verificação de URL)' },
      { marker: "'restore-session'", key: 'restauração de sessão', title: 'Restauração automática das abas ao reabrir o navegador' }
    ]

    for (const item of builtIn) {
      if (mainSource.includes(item.marker)) {
        memory.addCompletedFeature(item.title, { detectedBy: 'seed', marker: item.marker })
        memory.completePendingFeature(item.title)
      }
    }

    memory.addDecision('Arquitetura: Electron com IPC via módulos em src/, navegação 100% direta na internet (sem proxy e sem servidor local), IA via Ollama e Agent Core com níveis de segurança verde/amarelo/vermelho')
  } catch {
    // sem main.js legível: memória continua vazia, sem erro
  }
}

seedBuiltInFeatures()

function getIpcHandlers() {
  return {
    'agent-observe': async () => agent.observe(),
    'agent-analyze': async () => agent.analyze(),
    'agent-plan': async (_event, goal) => agent.plan(goal),
    'agent-execute-step': async (_event, stepId, confirmed) => {
      const plan = agent.state.plan
      if (!plan) return { success: false, error: 'Nenhum plano ativo' }
      const step = plan.steps.find(s => s.id === stepId)
      return agent.executeStep(step, { confirmed: Boolean(confirmed) })
    },
    'agent-approve': async (_event, approvalId) => agent.approve(approvalId),
    'agent-reject': async (_event, approvalId, reason) => agent.reject(approvalId, reason),
    'agent-verify': async () => agent.verify(),
    'agent-run-cycle': async (_event, goal) => agent.runCycle(goal),
    'agent-status': async () => agent.getStatus(),
    'agent-activity': async () => agent.getActivity(),
    'agent-optimizer-report': async () => agent.getOptimizerReport(),
    'agent-opportunity-action': async (_event, id, action) => agent.handleOpportunityAction(id, action),
    'agent-memory': async () => memory.getAll(),
    'agent-memory-note': async (_event, key, value) => memory.setNote(key, value),
    'agent-memory-feature': async (_event, title, details) => memory.addCompletedFeature(title, details),
    'agent-memory-pending': async (_event, title, details) => memory.addPendingFeature(title, details),
    'agent-memory-decision': async (_event, text) => memory.addDecision(text),
    'agent-memory-reset': async () => memory.reset(),
    'agent-command-run': async (_event, command, confirmed) => runner.run(command, { confirmed: Boolean(confirmed) }),
    'agent-command-classify': async (_event, command) => runner.classify(command),
    'agent-command-history': async () => runner.getHistory()
  }
}

module.exports = {
  setAiProvider,
  setMainWindow,
  getIpcHandlers,
  agent,
  memory,
  context,
  analyzer,
  optimizer,
  runner,
  editor,
  tester,
  errorAnalyzer
}
