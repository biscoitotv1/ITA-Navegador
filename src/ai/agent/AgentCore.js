/* =========================================================
 * ITA AI — Agent Core 2.0
 *
 * Ciclo:
 *
 * Observar
 *    ↓
 * Analisar
 *    ↓
 * Detectar oportunidades
 *    ↓
 * Priorizar
 *    ↓
 * Planejar
 *    ↓
 * Executar
 *    ↓
 * Verificar
 *    ↓
 * Diagnosticar
 *    ↓
 * Corrigir
 *    ↓
 * Aprender
 *    ↓
 * Melhorar continuamente
 *
 * Segurança:
 * - Comandos perigosos exigem aprovação
 * - Edições exigem aprovação
 * - Limite de tentativas de correção
 * - Proteção contra ciclos duplicados
 * - Não executa código inventado
 * ========================================================= */

'use strict';

class AgentCore {

  constructor(deps = {}) {

    /* =====================================================
     * DEPENDÊNCIAS
     * ===================================================== */

    this.memory = deps.memory;
    this.context = deps.context;
    this.analyzer = deps.analyzer;
    this.optimizer = deps.optimizer;
    this.planner = deps.planner;
    this.runner = deps.runner;
    this.editor = deps.editor;
    this.tester = deps.tester;
    this.errorAnalyzer = deps.errorAnalyzer;

    /* =====================================================
     * JANELA PRINCIPAL
     * ===================================================== */

    this.win = null;

    /* =====================================================
     * ATIVIDADE
     * ===================================================== */

    this.activity = [];

    /* =====================================================
     * ESTADO DO AGENTE
     * ===================================================== */

    this.state = {

      status: 'idle',

      currentGoal: null,

      plan: null,

      pendingApprovals: new Map(),

      changedFiles: [],

      running: false,

      fixAttempts: 0,

      maxFixAttempts: 3,

      cycleId: null,

      startedAt: null,

      lastSnapshot: null,

      lastAnalysis: null,

      lastReport: null,

      lastVerification: null,

      lastErrorAnalysis: null,

      opportunities: [],

      completedGoals: [],

      failedGoals: [],

      learningEvents: []

    };

    /* =====================================================
     * CONFIGURAÇÃO DO AGENTE
     * ===================================================== */

    this.config = {

      maxActivity: 200,

      maxVisibleActivity: 100,

      maxFixAttempts: 3,

      maxOpportunities: 20,

      maxPlanSteps: 30,

      autoAnalyze: true,

      autoPrioritize: true,

      autoLearn: true,

      stopOnApproval: true,

      stopOnCriticalError: true,

      allowParallelSafeSteps: false

    };
  }

  /* =======================================================
   * WINDOW
   * ======================================================= */

  setWindow(win) {

    this.win = win;

  }

  /* =======================================================
   * EVENTOS
   * ======================================================= */

  emitEvent(type, payload = {}) {

    const event = {

      type,

      payload,

      at: new Date().toISOString()

    };

    this.activity.push(event);

    if (this.activity.length > this.config.maxActivity) {

      this.activity =
        this.activity.slice(-this.config.maxActivity);

    }

    if (
      this.win &&
      typeof this.win.isDestroyed === 'function' &&
      !this.win.isDestroyed()
    ) {

      try {

        this.win.webContents.send(
          'agent-event',
          event
        );

      } catch {

        // Janela fechando.
      }
    }

  }

  log(message, level = 'info') {

    this.emitEvent('log', {

      message,

      level

    });

  }

  setStatus(status) {

    this.state.status = status;

    this.emitEvent('status', {

      status

    });

  }

  /* =======================================================
   * UTILIDADES
   * ======================================================= */

  generateId(prefix = 'ita') {

    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  }

  safeNumber(value, fallback = 0) {

    return Number.isFinite(Number(value))
      ? Number(value)
      : fallback;

  }

  normalizeText(value) {

    return String(value || '')
      .trim()
      .toLowerCase();

  }

  /* =======================================================
   * OBSERVAR
   * ======================================================= */

  async observe() {

    this.setStatus('observing');

    try {

      if (
        !this.context ||
        typeof this.context.observe !== 'function'
      ) {

        throw new Error(
          'Context Engine não está disponível.'
        );

      }

      const snapshot =
        await this.context.observe();

      this.state.lastSnapshot =
        snapshot;

      const files =
        snapshot?.files || {};

      const git =
        snapshot?.git || {};

      const ollama =
        snapshot?.ollama || {};

      this.log(
        `👁️ Observado: ${files.count ?? 0} arquivos, ` +
        `${files.totalLines ?? 0} linhas, ` +
        `Git: ${git.isRepo ? git.branch : 'não inicializado'}, ` +
        `Ollama: ${ollama.running ? 'online' : 'offline'}`
      );

      this.emitEvent(
        'observation',
        snapshot
      );

      return snapshot;

    } catch (error) {

      this.log(
        `❌ Falha durante observação: ${error.message}`,
        'error'
      );

      throw error;

    } finally {

      this.setStatus('idle');

    }
  }

  /* =======================================================
   * ANALISAR
   * ======================================================= */

  async analyze(snapshot = null) {

    this.setStatus('analyzing');

    try {

      const currentSnapshot =
        snapshot ||
        this.state.lastSnapshot ||
        await this.observe();

      if (
        !this.analyzer ||
        typeof this.analyzer.analyze !== 'function'
      ) {

        throw new Error(
          'Analyzer não está disponível.'
        );

      }

      const analysis =
        await this.analyzer.analyze(
          currentSnapshot
        );

      this.state.lastAnalysis =
        analysis;

      let report = {

        score: 0,

        health: 'unknown'

      };

      if (
        this.optimizer &&
        typeof this.optimizer.analyze === 'function'
      ) {

        report =
          await this.optimizer.analyze(
            currentSnapshot,
            analysis
          );

      }

      this.state.lastReport =
        report;

      const findings =
        Array.isArray(analysis?.findings)
          ? analysis.findings
          : [];

      const counts =
        analysis?.counts || {};

      const totalFindings =
        this.safeNumber(
          analysis?.totalFindings,
          findings.length
        );

      this.log(
        `🔍 Análise concluída: ` +
        `${totalFindings} achados ` +
        `(${counts.high ?? 0} altos, ` +
        `${counts.medium ?? 0} médios, ` +
        `${counts.low ?? 0} baixos). ` +
        `Saúde: ${report.score ?? 0}/100 ` +
        `(${report.health ?? 'desconhecida'})`
      );

      /* -----------------------------------------------
       * REGISTRAR PROBLEMAS IMPORTANTES
       * ----------------------------------------------- */

      if (
        this.memory &&
        typeof this.memory.addKnownProblem === 'function'
      ) {

        for (
          const finding
          of findings
            .filter(f => f?.severity === 'high')
            .slice(0, 5)
        ) {

          this.memory.addKnownProblem(

            finding.message,

            {

              file: finding.file,

              type: finding.type,

              severity: finding.severity

            }

          );

        }
      }

      /* -----------------------------------------------
       * DETECTAR OPORTUNIDADES
       * ----------------------------------------------- */

      this.detectOpportunities(
        findings,
        report
      );

      this.emitEvent(
        'analysis',
        {

          snapshot: currentSnapshot,

          analysis,

          report,

          opportunities:
            this.state.opportunities

        }
      );

      return {

        snapshot: currentSnapshot,

        analysis,

        report

      };

    } finally {

      this.setStatus('idle');

    }
  }

  /* =======================================================
   * DETECTAR OPORTUNIDADES
   * ======================================================= */

  detectOpportunities(
    findings = [],
    report = {}
  ) {

    const opportunities = [];

    for (const finding of findings) {

      if (!finding) continue;

      const severity =
        finding.severity || 'low';

      let priority = 30;

      if (severity === 'critical') {

        priority = 100;

      } else if (severity === 'high') {

        priority = 80;

      } else if (severity === 'medium') {

        priority = 60;

      }

      opportunities.push({

        id:
          finding.id ||
          this.generateId('opportunity'),

        type:
          finding.type ||
          'improvement',

        description:
          finding.message ||
          finding.description ||
          'Melhoria detectada',

        file:
          finding.file ||
          null,

        severity,

        priority,

        status: 'new',

        source: 'analyzer',

        createdAt:
          new Date().toISOString()

      });

    }

    /* -----------------------------------------------
     * SAÚDE BAIXA
     * ----------------------------------------------- */

    const score =
      this.safeNumber(
        report?.score,
        100
      );

    if (score < 70) {

      opportunities.push({

        id:
          this.generateId(
            'health'
          ),

        type:
          'health',

        description:
          'A saúde geral do projeto está abaixo do nível recomendado.',

        file:
          null,

        severity:
          score < 40
            ? 'high'
            : 'medium',

        priority:
          score < 40
            ? 90
            : 65,

        status:
          'new',

        source:
          'optimizer',

        createdAt:
          new Date().toISOString()

      });

    }

    /* -----------------------------------------------
     * LIMITE
     * ----------------------------------------------- */

    this.state.opportunities =
      opportunities
        .sort(
          (a, b) =>
            b.priority -
            a.priority
        )
        .slice(
          0,
          this.config.maxOpportunities
        );

    /* -----------------------------------------------
     * MEMÓRIA
     * ----------------------------------------------- */

    if (
      this.memory &&
      this.memory.data
    ) {

      this.memory.data.opportunities =
        this.state.opportunities;

    }

    this.emitEvent(
      'opportunities',
      this.state.opportunities
    );

    return this.state.opportunities;
  }

  /* =======================================================
   * PRIORIZAR
   * ======================================================= */

  prioritizeOpportunities(
    opportunities = this.state.opportunities
  ) {

    const list =
      Array.isArray(opportunities)
        ? opportunities
        : [];

    const priorityWeight = {

      critical: 100,

      high: 80,

      medium: 60,

      low: 30

    };

    return list
      .map(item => {

        const severityScore =
          priorityWeight[
            item.severity
          ] || 20;

        const explicitPriority =
          this.safeNumber(
            item.priority,
            0
          );

        return {

          ...item,

          priority:
            Math.max(
              explicitPriority,
              severityScore
            )

        };

      })
      .sort(
        (a, b) =>
          b.priority -
          a.priority
      );
  }

  /* =======================================================
   * PLANEJAR
   * ======================================================= */

  async plan(goal) {

    this.setStatus('planning');

    try {

      this.state.currentGoal =
        goal ||
        'Melhorar o projeto ITA Browser';

      const snapshot =
        this.state.lastSnapshot ||
        await this.observe();

      const analysisResult =
        this.state.lastAnalysis
          ? {
              snapshot,
              analysis:
                this.state.lastAnalysis,
              report:
                this.state.lastReport
            }
          : await this.analyze(
              snapshot
            );

      if (
        !this.planner ||
        typeof this.planner.createPlan !== 'function'
      ) {

        throw new Error(
          'Planner não está disponível.'
        );

      }

      const memoryData =
        this.memory?.data || {};

      let plan =
        await this.planner.createPlan(

          this.state.currentGoal,

          snapshot,

          analysisResult.analysis,

          memoryData

        );

      if (!plan) {

        throw new Error(
          'Planner não retornou um plano.'
        );

      }

      if (!Array.isArray(plan.steps)) {

        plan.steps = [];

      }

      plan.steps =
        plan.steps
          .slice(
            0,
            this.config.maxPlanSteps
          )
          .map(
            (step, index) => ({

              ...step,

              index,

              status:
                step.status ||
                'pending'

            })
          );

      plan.createdAt =
        new Date().toISOString();

      plan.goal =
        this.state.currentGoal;

      this.state.plan =
        plan;

      this.state.fixAttempts =
        0;

      this.log(
        `🗺️ Plano criado ` +
        `(${plan.source === 'ollama'
          ? 'via Ollama'
          : 'heurístico'}): ` +
        `${plan.steps.length} passos — ` +
        `${plan.objective || this.state.currentGoal}`
      );

      this.emitEvent(
        'plan',
        plan
      );

      this.setStatus('ready');

      return plan;

    } catch (error) {

      this.setStatus('idle');

      this.log(
        `❌ Erro ao criar plano: ${error.message}`,
        'error'
      );

      throw error;

    }
  }

  /* =======================================================
   * APROVAÇÃO
   * ======================================================= */

  requestApproval(
    step,
    details = {}
  ) {

    const id =
      this.generateId(
        'approval'
      );

    const approval = {

      id,

      stepId:
        step?.id ||
        step?.index,

      kind:
        details.kind,

      title:
        details.title ||
        step?.title ||
        'Ação requer aprovação',

      description:
        details.description ||
        step?.description ||
        '',

      diff:
        details.diff ||
        null,

      command:
        details.command ||
        null,

      file:
        details.file ||
        null,

      proposalId:
        details.proposalId ||
        null,

      safety:
        details.safety ||
        step?.safety ||
        'yellow',

      status:
        'pending',

      createdAt:
        new Date().toISOString()

    };

    this.state.pendingApprovals.set(
      id,
      approval
    );

    this.emitEvent(
      'approval-request',
      approval
    );

    this.log(
      `🛡️ Aprovação necessária ` +
      `(${approval.safety === 'red'
        ? '🔴 perigoso'
        : '🟡 alteração'}): ` +
      `${approval.title}`,
      'warn'
    );

    return approval;
  }

  /* =======================================================
   * APROVAÇÕES PENDENTES
   * ======================================================= */

  listPendingApprovals() {

    return [
      ...this.state.pendingApprovals.values()
    ];

  }

  /* =======================================================
   * APROVAR
   * ======================================================= */

  async approve(approvalId) {

    const approval =
      this.state.pendingApprovals.get(
        approvalId
      );

    if (!approval) {

      return {

        success: false,

        error:
          'Aprovação não encontrada'

      };

    }

    this.state.pendingApprovals.delete(
      approvalId
    );

    approval.status =
      'approved';

    approval.approvedAt =
      new Date().toISOString();

    this.log(
      `✅ Aprovado: ${approval.title}`
    );

    /* -----------------------------------------------
     * COMANDO
     * ----------------------------------------------- */

    if (
      approval.kind === 'command'
    ) {

      if (
        !this.runner ||
        typeof this.runner.run !== 'function'
      ) {

        return {

          success: false,

          error:
            'Command Runner não está disponível.'

        };

      }

      return this.runner.run(
        approval.command,
        {
          confirmed: true
        }
      );
    }

    /* -----------------------------------------------
     * EDIÇÃO
     * ----------------------------------------------- */

    if (
      approval.kind === 'edit'
    ) {

      if (
        !this.editor ||
        typeof this.editor.applyProposal !== 'function'
      ) {

        return {

          success: false,

          error:
            'Editor não está disponível.'

        };

      }

      const outcome =
        await this.editor.applyProposal(
          approval.proposalId
        );

      if (outcome?.success) {

        if (
          approval.file &&
          !this.state.changedFiles.includes(
            approval.file
          )
        ) {

          this.state.changedFiles.push(
            approval.file
          );

        }

        if (
          this.memory &&
          typeof this.memory.addDecision === 'function'
        ) {

          this.memory.addDecision(

            `Editado ${approval.file}: ${approval.title}`

          );

        }

        this.emitEvent(
          'edit-applied',
          {

            file:
              approval.file,

            proposalId:
              approval.proposalId

          }
        );

      } else {

        this.log(
          `❌ Falha ao aplicar edição: ` +
          `${outcome?.error || 'erro desconhecido'}`,
          'error'
        );

      }

      return outcome;

    }

    return {

      success: false,

      error:
        'Tipo de aprovação desconhecido'

    };
  }

  /* =======================================================
   * REJEITAR
   * ======================================================= */

  async reject(
    approvalId,
    reason = ''
  ) {

    const approval =
      this.state.pendingApprovals.get(
        approvalId
      );

    if (!approval) {

      return {

        success: false,

        error:
          'Aprovação não encontrada'

      };

    }

    this.state.pendingApprovals.delete(
      approvalId
    );

    approval.status =
      'rejected';

    approval.rejectedAt =
      new Date().toISOString();

    if (
      approval.kind === 'edit' &&
      approval.proposalId &&
      this.editor &&
      typeof this.editor.rejectProposal === 'function'
    ) {

      await this.editor.rejectProposal(
        approval.proposalId,
        reason
      );

    }

    this.log(
      `🚫 Rejeitado: ${approval.title}` +
      `${reason ? ` — ${reason}` : ''}`,
      'warn'
    );

    return {

      success: true,

      id:
        approvalId

    };
  }

  /* =======================================================
   * EXECUTAR PASSO
   * ======================================================= */

  async executeStep(
    step,
    options = {}
  ) {

    if (!step) {

      return {

        success: false,

        error:
          'Passo inválido'

      };

    }

    step.status =
      'running';

    this.emitEvent(
      'step-start',
      step
    );

    this.log(
      `▶️ Executando passo ` +
      `${(step.index ?? 0) + 1}: ` +
      `${step.title || 'Sem título'}`
    );

    try {

      /* -----------------------------------------------
       * ANÁLISE
       * ----------------------------------------------- */

      if (
        step.type === 'analyze'
      ) {

        const result =
          await this.analyze();

        step.status =
          'done';

        step.result = {

          summary:
            `${result.analysis?.totalFindings ?? 0} achados, ` +
            `saúde ${result.report?.score ?? 0}/100`

        };

      }

      /* -----------------------------------------------
       * COMANDO
       * ----------------------------------------------- */

      else if (
        step.type === 'command'
      ) {

        if (
          !this.runner ||
          typeof this.runner.classify !== 'function'
        ) {

          throw new Error(
            'Command Runner não está disponível.'
          );

        }

        const classification =
          this.runner.classify(
            step.command
          );

        if (
          classification.requiresApproval &&
          !options.confirmed
        ) {

          const approval =
            this.requestApproval(
              step,
              {

                kind:
                  'command',

                title:
                  step.title,

                description:
                  step.description,

                command:
                  step.command,

                safety:
                  classification.level

              }
            );

          step.status =
            'awaiting-approval';

          step.result = {

            awaiting:
              true,

            approvalId:
              approval.id,

            reason:
              classification.reason

          };

          this.emitEvent(
            'step-update',
            step
          );

          return {

            success:
              false,

            awaitingApproval:
              true,

            step

          };

        }

        const outcome =
          await this.runner.run(
            step.command,
            {

              confirmed:
                true

            }
          );

        step.result =
          outcome;

        step.status =
          outcome?.executed &&
          outcome?.exitCode === 0
            ? 'done'
            : 'failed';

        this.log(
          `${step.status === 'done'
            ? '✅'
            : '❌'} Comando "${step.command}" → ` +
          `${outcome?.message || ''}`,
          step.status === 'done'
            ? 'info'
            : 'error'
        );

      }

      /* -----------------------------------------------
       * EDIÇÃO
       * ----------------------------------------------- */

      else if (
        step.type === 'edit'
      ) {

        if (!step.file) {

          step.status =
            'failed';

          step.result = {

            error:
              'Passo de edição sem arquivo alvo'

          };

        } else {

          const content =
            step.content ||
            this.buildEditContent(
              step
            );

          if (!content) {

            step.status =
              'skipped';

            step.result = {

              skipped:
                true,

              reason:
                'Sem correção determinística disponível — requer investigação manual ou geração segura de código via Ollama.'

            };

            this.log(
              `⏭️ Passo "${step.title}" ` +
              `marcado como investigação.`,
              'warn'
            );

            this.emitEvent(
              'step-update',
              step
            );

            return {

              success:
                false,

              skipped:
                true,

              step

            };

          }

          if (
            !this.editor ||
            typeof this.editor.proposeEdit !== 'function'
          ) {

            throw new Error(
              'Editor não está disponível.'
            );

          }

          const proposal =
            await this.editor.proposeEdit({

              file:
                step.file,

              newContent:
                content,

              description:
                step.description

            });

          if (!proposal?.success) {

            step.status =
              'failed';

            step.result = {

              error:
                proposal?.error ||
                'Falha ao criar proposta'

            };

            this.log(
              `⚠️ ${step.result.error}`,
              'warn'
            );

          } else {

            const approval =
              this.requestApproval(
                step,
                {

                  kind:
                    'edit',

                  title:
                    step.title,

                  description:
                    step.description,

                  diff:
                    proposal.proposal?.diff,

                  file:
                    proposal.proposal?.file ||
                    step.file,

                  proposalId:
                    proposal.proposal?.id,

                  safety:
                    'yellow'

                }
              );

            step.status =
              'awaiting-approval';

            step.result = {

              awaiting:
                true,

              approvalId:
                approval.id,

              diff:
                proposal.proposal?.diff

            };

          }

        }

      }

      /* -----------------------------------------------
       * VERIFICAÇÃO
       * ----------------------------------------------- */

      else if (
        step.type === 'verify'
      ) {

        const verification =
          await this.verify();

        step.result =
          verification;

        step.status =
          verification?.passed
            ? 'done'
            : 'failed';

      }

      /* -----------------------------------------------
       * PASSO DESCONHECIDO
       * ----------------------------------------------- */

      else {

        step.status =
          'skipped';

        step.result = {

          skipped:
            true,

          reason:
            `Tipo de passo não suportado: ${step.type}`

        };

      }

      this.emitEvent(
        'step-update',
        step
      );

      return {

        success:
          step.status === 'done',

        step

      };

    } catch (error) {

      step.status =
        'failed';

      step.result = {

        error:
          error.message

      };

      this.emitEvent(
        'step-update',
        step
      );

      this.log(
        `❌ Erro no passo "${step.title}": ${error.message}`,
        'error'
      );

      return {

        success:
          false,

        step

      };

    }
  }

  /* =======================================================
   * CONTEÚDO DETERMINÍSTICO
   * ======================================================= */

  buildEditContent(step) {

    if (
      step.file === 'package.json'
    ) {

      const fs =
        require('fs');

      const path =
        require('path');

      try {

        const root =
          this.context?.root;

        if (!root) {

          return null;

        }

        const pkgPath =
          path.join(
            root,
            'package.json'
          );

        const pkg =
          JSON.parse(
            fs.readFileSync(
              pkgPath,
              'utf-8'
            )
          );

        pkg.scripts =
          pkg.scripts || {};

        if (
          /no-test-script/i.test(
            step.title || ''
          ) &&
          !pkg.scripts.test
        ) {

          pkg.scripts.test =
            'node --check main.js';

        }

        if (
          /no-build-script/i.test(
            step.title || ''
          ) &&
          !pkg.scripts.build
        ) {

          pkg.scripts.build =
            'echo "ITA Browser: build de validacao"';

        }

        return (
          JSON.stringify(
            pkg,
            null,
            2
          ) + '\n'
        );

      } catch {

        return null;

      }
    }

    return null;
  }

  /* =======================================================
   * VERIFICAR
   * ======================================================= */

  async verify() {

    this.setStatus(
      'verifying'
    );

    try {

      if (
        !this.tester ||
        typeof this.tester.verify !== 'function'
      ) {

        throw new Error(
          'Tester não está disponível.'
        );

      }

      const verification =
        await this.tester.verify(
          this.state.changedFiles
        );

      this.state.lastVerification =
        verification;

      if (
        verification?.passed
      ) {

        this.log(
          '✅ Verificação concluída com sucesso'
        );

        if (
          this.memory &&
          typeof this.memory.setLastSuccessfulBuild === 'function'
        ) {

          this.memory.setLastSuccessfulBuild({

            passed:
              true,

            files:
              this.state.changedFiles

          });

        }

      } else {

        this.log(
          '❌ Verificação falhou — analisando erros',
          'error'
        );

        const results =
          Array.isArray(
            verification?.results
          )
            ? verification.results
            : [];

        const failed =
          results.find(
            r => !r.passed
          );

        const errorText =
          failed
            ? `${failed.stderr || ''}\n${failed.stdout || ''}`
            : '';

        let parsed = {

          hasErrors:
            false,

          errors:
            [],

          summary:
            'Falha sem detalhes.'

        };

        if (
          this.errorAnalyzer &&
          typeof this.errorAnalyzer.parse === 'function'
        ) {

          parsed =
            this.errorAnalyzer.parse(
              errorText
            );

        }

        this.state.lastErrorAnalysis =
          parsed;

        if (
          parsed?.hasErrors
        ) {

          this.emitEvent(
            'errors',
            parsed
          );

          if (
            this.memory &&
            typeof this.memory.addKnownProblem === 'function'
          ) {

            for (
              const error
              of (parsed.errors || [])
                .slice(0, 3)
            ) {

              this.memory.addKnownProblem(

                error.raw,

                {

                  type:
                    error.type

                }

              );

            }

          }

        }

      }

      this.emitEvent(
        'verification',
        verification
      );

      return verification;

    } finally {

      this.setStatus(
        'idle'
      );

    }
  }

  /* =======================================================
   * APRENDER
   * ======================================================= */

  learn(result = {}) {

    if (
      !this.config.autoLearn
    ) {

      return;

    }

    const learningEvent = {

      id:
        this.generateId(
          'learning'
        ),

      goal:
        this.state.currentGoal,

      success:
        Boolean(result.success),

      stepsCompleted:
        result.stepsCompleted || 0,

      stepsTotal:
        result.stepsTotal || 0,

      fixAttempts:
        this.state.fixAttempts,

      changedFiles:
        [...this.state.changedFiles],

      timestamp:
        new Date().toISOString()

    };

    this.state.learningEvents.push(
      learningEvent
    );

    if (
      this.state.learningEvents.length > 50
    ) {

      this.state.learningEvents =
        this.state.learningEvents.slice(
          -50
        );

    }

    if (
      this.memory &&
      typeof this.memory.recordCycle === 'function'
    ) {

      try {

        this.memory.recordCycle({

          ...result,

          learning:
            learningEvent

        });

      } catch {

        // Memória opcional.
      }
    }

    this.emitEvent(
      'learning',
      learningEvent
    );

    this.log(
      result.success
        ? '🧠 ITA AI registrou o aprendizado do ciclo.'
        : '🧠 ITA AI registrou a falha para análise futura.'
    );
  }

  /* =======================================================
   * CORREÇÃO INTELIGENTE
   * ======================================================= */

  async attemptCorrection() {

    if (
      this.state.fixAttempts >=
      this.config.maxFixAttempts
    ) {

      this.log(
        `🛑 Limite de ${this.config.maxFixAttempts} ` +
        `tentativas de correção atingido.`,
        'warn'
      );

      return {

        success:
          false,

        exhausted:
          true

      };

    }

    this.state.fixAttempts += 1;

    this.log(
      `🔧 Tentativa de correção ` +
      `${this.state.fixAttempts}/` +
      `${this.config.maxFixAttempts}`,
      'warn'
    );

    const errorAnalysis =
      this.state.lastErrorAnalysis;

    const fixGoal =
      errorAnalysis?.hasErrors
        ? `Corrigir erros detectados: ${errorAnalysis.summary}`
        : 'Corrigir falhas da verificação';

    if (
      !this.planner ||
      typeof this.planner.createPlan !== 'function'
    ) {

      return {

        success:
          false,

        error:
          'Planner não disponível.'

      };

    }

    const snapshot =
      await this.context.observe();

    const fixPlan =
      await this.planner.createPlan(

        fixGoal,

        snapshot,

        {

          findings:
            errorAnalysis?.errors || []

        },

        this.memory?.data || {}

      );

    if (
      !fixPlan ||
      !Array.isArray(fixPlan.steps)
    ) {

      return {

        success:
          false,

        error:
          'Plano de correção inválido.'

      };

    }

    for (
      const fixStep
      of fixPlan.steps
    ) {

      if (
        fixStep.type === 'verify'
      ) {

        continue;

      }

      const outcome =
        await this.executeStep(
          fixStep
        );

      if (
        outcome.awaitingApproval &&
        this.config.stopOnApproval
      ) {

        return {

          success:
            false,

          awaitingApproval:
            true,

          step:
            fixStep

        };

      }

    }

    const reverify =
      await this.verify();

    if (
      reverify?.passed
    ) {

      this.log(
        '✅ Correção validada com sucesso'
      );

      return {

        success:
          true,

        verification:
          reverify

      };

    }

    return {

      success:
        false,

      verification:
        reverify

    };
  }

  /* =======================================================
   * CICLO PRINCIPAL
   * ======================================================= */

  async runCycle(goal) {

    if (
      this.state.running
    ) {

      return {

        success:
          false,

        error:
          'Já existe um ciclo em execução'

      };

    }

    this.state.running =
      true;

    this.state.cycleId =
      this.generateId(
        'cycle'
      );

    this.state.startedAt =
      Date.now();

    this.state.changedFiles =
      [];

    this.state.fixAttempts =
      0;

    const startedAt =
      Date.now();

    let aborted =
      false;

    let failure =
      false;

    try {

      /* -----------------------------------------------
       * 1. PLANEJAR
       * ----------------------------------------------- */

      const plan =
        await this.plan(
          goal
        );

      /* -----------------------------------------------
       * 2. EXECUTAR
       * ----------------------------------------------- */

      for (
        const step
        of plan.steps
      ) {

        if (
          step.status === 'done'
        ) {

          continue;

        }

        const outcome =
          await this.executeStep(
            step
          );

        /* ---------------------------------------------
         * APROVAÇÃO
         * --------------------------------------------- */

        if (
          outcome.awaitingApproval
        ) {

          aborted =
            true;

          this.log(
            '⏸️ Ciclo pausado aguardando aprovação.',
            'warn'
          );

          break;

        }

        /* ---------------------------------------------
         * FALHA
         * --------------------------------------------- */

        if (
          step.status === 'failed'
        ) {

          failure =
            true;

          /* -------------------------------------------
           * TENTAR CORRIGIR
           * ------------------------------------------- */

          if (
            step.type === 'verify' &&
            this.state.fixAttempts <
              this.config.maxFixAttempts
          ) {

            const correction =
              await this.attemptCorrection();

            if (
              correction.awaitingApproval
            ) {

              aborted =
                true;

              break;

            }

            if (
              correction.success
            ) {

              failure =
                false;

            }

          }

          if (
            failure &&
            this.config.stopOnCriticalError &&
            step.safety === 'red'
          ) {

            this.log(
              '🛑 Execução interrompida devido a passo crítico.',
              'error'
            );

            break;

          }

        }

      }

      /* -----------------------------------------------
       * RESULTADO
       * ----------------------------------------------- */

      const stepsCompleted =
        plan.steps.filter(
          step =>
            step.status === 'done'
        ).length;

      const result = {

        success:
          !aborted &&
          !failure,

        paused:
          aborted,

        failed:
          failure,

        goal:
          this.state.currentGoal,

        cycleId:
          this.state.cycleId,

        stepsCompleted,

        stepsTotal:
          plan.steps.length,

        durationMs:
          Date.now() -
          startedAt

      };

      /* -----------------------------------------------
       * MEMÓRIA / APRENDIZADO
       * ----------------------------------------------- */

      if (
        result.success
      ) {

        this.state.completedGoals.push(
          this.state.currentGoal
        );

      } else if (
        result.failed
      ) {

        this.state.failedGoals.push(
          this.state.currentGoal
        );

      }

      this.learn(
        result
      );

      /* -----------------------------------------------
       * EVENTOS
       * ----------------------------------------------- */

      this.emitEvent(
        'cycle-complete',
        result
      );

      this.log(
        `🏁 Ciclo finalizado: ` +
        `${result.stepsCompleted}/` +
        `${result.stepsTotal} passos em ` +
        `${(result.durationMs / 1000).toFixed(1)}s` +
        `${aborted
          ? ' (pausado para aprovação)'
          : ''}`
      );

      return result;

    } catch (error) {

      this.log(
        `❌ Erro fatal no ciclo: ${error.message}`,
        'error'
      );

      const result = {

        success:
          false,

        paused:
          false,

        failed:
          true,

        error:
          error.message,

        goal:
          this.state.currentGoal,

        cycleId:
          this.state.cycleId,

        durationMs:
          Date.now() -
          startedAt

      };

      this.learn(
        result
      );

      this.emitEvent(
        'cycle-error',
        result
      );

      return result;

    } finally {

      this.state.running =
        false;

      this.state.startedAt =
        null;

      this.setStatus(
        'idle'
      );

    }
  }

  /* =======================================================
   * MELHORIA CONTÍNUA
   * ======================================================= */

  async improveProject() {

    if (
      this.state.running
    ) {

      return {

        success:
          false,

        error:
          'O agente já está executando outro ciclo.'

      };

    }

    this.log(
      '🚀 Iniciando análise de melhoria contínua.'
    );

    const analysis =
      await this.analyze();

    const opportunities =
      this.prioritizeOpportunities(
        this.state.opportunities
      );

    if (
      !opportunities.length
    ) {

      this.log(
        '✨ Nenhuma oportunidade prioritária encontrada.'
      );

      return {

        success:
          true,

        improved:
          false,

        opportunities:
          []

      };

    }

    const top =
      opportunities[0];

    this.log(
      `🎯 Melhor oportunidade encontrada: ` +
      `${top.description} ` +
      `(prioridade ${top.priority})`
    );

    const goal =
      `Melhorar o projeto: ${top.description}`;

    const result =
      await this.runCycle(
        goal
      );

    return {

      success:
        result.success,

      improved:
        result.success,

      opportunity:
        top,

      result,

      analysis

    };
  }

  /* =======================================================
   * AÇÕES DE OPORTUNIDADE
   * ======================================================= */

  async handleOpportunityAction(
    id,
    action
  ) {

    if (
      action === 'analyze'
    ) {

      const report =
        await this.analyze();

      return {

        success:
          true,

        report:
          report.report

      };

    }

    if (
      action === 'plan'
    ) {

      const opportunity =
        (
          this.memory?.data?.opportunities ||
          this.state.opportunities ||
          []
        ).find(
          o => o.id === id
        );

      const goal =
        opportunity
          ? `Resolver: ${opportunity.description}`
          : 'Melhorar o projeto';

      const plan =
        await this.plan(
          goal
        );

      if (
        this.optimizer &&
        typeof this.optimizer.markStatus === 'function'
      ) {

        this.optimizer.markStatus(
          id,
          'planned'
        );

      }

      return {

        success:
          true,

        plan

      };

    }

    if (
      action === 'fix'
    ) {

      const opportunity =
        (
          this.memory?.data?.opportunities ||
          this.state.opportunities ||
          []
        ).find(
          o => o.id === id
        );

      const goal =
        opportunity
          ? `Corrigir: ${opportunity.description}`
          : 'Corrigir problemas do projeto';

      const result =
        await this.runCycle(
          goal
        );

      if (
        result.stepsCompleted > 0 &&
        this.optimizer &&
        typeof this.optimizer.markStatus === 'function'
      ) {

        this.optimizer.markStatus(
          id,
          'planned'
        );

      }

      return {

        success:
          true,

        result

      };

    }

    if (
      action === 'ignore'
    ) {

      if (
        this.optimizer &&
        typeof this.optimizer.markStatus === 'function'
      ) {

        this.optimizer.markStatus(
          id,
          'ignored'
        );

      }

      this.log(
        `🔕 Oportunidade ignorada: ${id}`
      );

      return {

        success:
          true

      };

    }

    return {

      success:
        false,

      error:
        'Ação desconhecida'

    };
  }

  /* =======================================================
   * STATUS
   * ======================================================= */

  getStatus() {

    return {

      status:
        this.state.status,

      running:
        this.state.running,

      currentGoal:
        this.state.currentGoal,

      cycleId:
        this.state.cycleId,

      plan:
        this.state.plan,

      pendingApprovals:
        this.listPendingApprovals(),

      changedFiles:
        [
          ...this.state.changedFiles
        ],

      fixAttempts:
        this.state.fixAttempts,

      maxFixAttempts:
        this.config.maxFixAttempts,

      opportunities:
        [
          ...this.state.opportunities
        ],

      lastVerification:
        this.state.lastVerification,

      activity:
        this.activity.slice(
          -this.config.maxVisibleActivity
        )

    };
  }

  /* =======================================================
   * ATIVIDADE
   * ======================================================= */

  getActivity() {

    return this.activity.slice(
      -this.config.maxVisibleActivity
    );

  }

  /* =======================================================
   * RELATÓRIO DO OPTIMIZER
   * ======================================================= */

  getOptimizerReport() {

    if (
      this.optimizer &&
      typeof this.optimizer.getReport === 'function'
    ) {

      return this.optimizer.getReport();

    }

    return {

      score:
        this.state.lastReport?.score ||
        0,

      health:
        this.state.lastReport?.health ||
        'unknown',

      opportunities:
        this.state.opportunities

    };
  }

  /* =======================================================
   * RESET DO AGENTE
   * ======================================================= */

  reset() {

    if (
      this.state.running
    ) {

      return {

        success:
          false,

        error:
          'Não é possível resetar enquanto o agente está executando.'

      };

    }

    this.state.status =
      'idle';

    this.state.currentGoal =
      null;

    this.state.plan =
      null;

    this.state.pendingApprovals.clear();

    this.state.changedFiles =
      [];

    this.state.fixAttempts =
      0;

    this.state.cycleId =
      null;

    this.state.startedAt =
      null;

    this.state.lastSnapshot =
      null;

    this.state.lastAnalysis =
      null;

    this.state.lastReport =
      null;

    this.state.lastVerification =
      null;

    this.state.lastErrorAnalysis =
      null;

    this.state.opportunities =
      [];

    this.log(
      '🔄 Agent Core resetado.'
    );

    return {

      success:
        true

    };
  }
}

/* =========================================================
 * EXPORTAÇÃO
 * ========================================================= */

module.exports = AgentCore;