/* =========================================================
   ITA AI — Code Analyzer
   Nível 2: Analisar o código e encontrar problemas
   ========================================================= */

const path = require('path')
const fs = require('fs')

class CodeAnalyzer {
  constructor(contextEngine) {
    this.context = contextEngine
  }

  newFinding(type, severity, message, options = {}) {
    return {
      id: `${type}:${options.file || 'geral'}:${options.line || 0}`,
      type,
      severity,
      message,
      file: options.file || null,
      line: options.line || null,
      suggestion: options.suggestion || null
    }
  }

  analyzeFile(relativePath, content, findings) {
    const lines = content.split('\n')
    const ext = path.extname(relativePath).toLowerCase()

    if (ext === '.js') {
      this.analyzeJs(relativePath, content, lines, findings)
    }
    if (ext === '.html') {
      this.analyzeHtml(relativePath, content, lines, findings)
    }

    // TODO/FIXME em qualquer arquivo de texto
    lines.forEach((line, index) => {
      if (/\b(TODO|FIXME|HACK|XXX)\b/.test(line)) {
        findings.push(this.newFinding('todo', 'low', `Marcador de trabalho pendente: "${line.trim().slice(0, 90)}"`, {
          file: relativePath,
          line: index + 1,
          suggestion: 'Concluir a tarefa ou documentá-la na memória do projeto'
        }))
      }
    })

    // Arquivo muito grande
    if (lines.length > 1500 && ext !== '.json') {
      findings.push(this.newFinding('large-file', 'low', `Arquivo muito grande (${lines.length} linhas)`, {
        file: relativePath,
        suggestion: 'Dividir em módulos menores para facilitar manutenção'
      }))
    }
  }

  // Verifica se a posição na linha está dentro de uma string/regex (evita
  // falsos positivos quando o próprio código menciona eval(), JSON.parse etc.)
  isInsideString(codePart, index) {
    let quotes = 0
    for (let i = 0; i < index; i++) {
      const ch = codePart[i]
      if (ch === "'" || ch === '"' || ch === '`') quotes++
    }
    return quotes % 2 === 1
  }

  analyzeJs(relativePath, content, lines, findings) {
    let inBlockComment = false

    lines.forEach((line, index) => {
      const trimmed = line.trim()
      const lineNumber = index + 1

      // Rastrear comentários de bloco (evitar falsos positivos)
      if (inBlockComment) {
        if (trimmed.includes('*/')) inBlockComment = false
        return
      }
      if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
        inBlockComment = true
        return
      }
      const codePart = trimmed.startsWith('//') ? '' : line

      // catch vazio (erros silenciados)
      if (/catch\s*(\([^)]*\))?\s*\{\s*\}/.test(codePart) || /catch\s*\{\s*\}/.test(codePart)) {
        findings.push(this.newFinding('empty-catch', 'medium', 'Bloco catch vazio: erro silenciado sem tratamento', {
          file: relativePath,
          line: lineNumber,
          suggestion: 'Registrar o erro (console.error) ou tratar de forma adequada'
        }))
      }

      // JSON.parse sem try (ignora menções dentro de strings/comentários)
      const parseIndex = codePart.indexOf('JSON.parse(')
      if (parseIndex !== -1 && !/try/.test(codePart) && !this.isInsideString(codePart, parseIndex)) {
        findings.push(this.newFinding('risky-parse', 'medium', 'JSON.parse possivelmente sem tratamento de erro', {
          file: relativePath,
          line: lineNumber,
          suggestion: 'Envolver em try/catch ou validar o JSON antes de parsear'
        }))
      }

      // eval — segurança (só chamadas reais, não textos/regex que mencionam eval)
      const evalMatches = [...codePart.matchAll(/(?<![\w$.'"`\\])eval\s*\(/g)]
      for (const match of evalMatches) {
        if (this.isInsideString(codePart, match.index)) continue
        findings.push(this.newFinding('eval-usage', 'high', 'Uso de eval(): risco de execução de código arbitrário', {
          file: relativePath,
          line: lineNumber,
          suggestion: 'Substituir por alternativas seguras (JSON.parse, mapeamento de funções, etc.)'
        }))
        break
      }

      // innerHTML — segurança (só quando o conteúdo é dinâmico; literais estáticos são seguros)
      const htmlMatch = codePart.match(/\.innerHTML\s*=\s*([^;]+);?\s*$/)
      if (htmlMatch) {
        const rhs = htmlMatch[1].trim()
        const isStaticLiteral = /^(['"`])[\s\S]*\1$/.test(rhs) && !rhs.includes('+') && !rhs.includes('${')
        if (!isStaticLiteral) {
          findings.push(this.newFinding('inner-html', 'medium', 'Atribuição dinâmica a innerHTML: risco de XSS', {
            file: relativePath,
            line: lineNumber,
            suggestion: 'Preferir textContent ou sanitizar o conteúdo antes de inserir'
          }))
        }
      }

      // require local quebrado
      const requireMatch = codePart.match(/require\(\s*['"](\.[^'"]+)['"]\s*\)/)
      if (requireMatch) {
        const target = requireMatch[1]
        const base = path.join(path.dirname(path.join(this.context.root, relativePath)), target)
        const candidates = [base, `${base}.js`, `${base}.json`, path.join(base, 'index.js')]
        if (!candidates.some(candidate => fs.existsSync(candidate))) {
          findings.push(this.newFinding('broken-require', 'high', `require local quebrado: "${target}" (arquivo não encontrado)`, {
            file: relativePath,
            line: lineNumber,
            suggestion: 'Corrigir o caminho do require ou criar o arquivo ausente'
          }))
        }
      }

      // == solto
      if (/[^=!<>]==[^=]/.test(codePart) && !/^\s*(\/\/|\*)/.test(line)) {
        findings.push(this.newFinding('loose-equality', 'low', 'Uso de == em vez de === (comparação frouxa)', {
          file: relativePath,
          line: lineNumber,
          suggestion: 'Usar === para evitar coerção inesperada de tipos'
        }))
      }

      // var em vez de let/const
      if (/^\s*var\s+/.test(line)) {
        findings.push(this.newFinding('var-usage', 'low', 'Uso de var (escopo de função, propenso a bugs)', {
          file: relativePath,
          line: lineNumber,
          suggestion: 'Substituir por let ou const'
        }))
      }
    })
  }

  analyzeHtml(relativePath, content, lines, findings) {
    lines.forEach((line, index) => {
      const lineNumber = index + 1

      // target="_blank" sem noopener
      if (/target\s*=\s*["']_blank["']/i.test(line) && !/noopener|noreferrer/i.test(line)) {
        findings.push(this.newFinding('blank-without-noopener', 'medium', 'target="_blank" sem rel="noopener"', {
          file: relativePath,
          line: lineNumber,
          suggestion: 'Adicionar rel="noopener noreferrer" para evitar tabnabbing'
        }))
      }

      // <img> sem alt
      if (/<img\b(?![^>]*\balt\s*=)[^>]*>/i.test(line)) {
        findings.push(this.newFinding('img-without-alt', 'low', 'Imagem sem atributo alt (acessibilidade)', {
          file: relativePath,
          line: lineNumber,
          suggestion: 'Adicionar alt descritivo ou alt="" para imagens decorativas'
        }))
      }
    })
  }

  findDuplicateFunctions(codeFiles) {
    const declarations = new Map()
    const findings = []

    for (const file of codeFiles) {
      if (file.ext !== '.js') continue
      const content = this.context.readFile(file.path, 300000)
      if (!content) continue
      const matches = content.matchAll(/(?:function\s+([a-zA-Z_$][\w$]*)\s*\(|const\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?\()/g)
      for (const match of matches) {
        const name = match[1] || match[2]
        if (!name || name.length < 4) continue
        if (!declarations.has(name)) declarations.set(name, [])
        declarations.get(name).push(file.path)
      }
    }

    for (const [name, filesList] of declarations) {
      const unique = [...new Set(filesList)]
      if (unique.length > 1) {
        findings.push(this.newFinding('duplicate-function', 'medium', `Função "${name}" declarada em ${unique.length} arquivos (${unique.join(', ')})`, {
          suggestion: 'Extrair para um módulo compartilhado e reutilizar'
        }))
      }
    }
    return findings
  }

  checkProjectHealth(snapshot, findings) {
    const pkg = snapshot.package
    if (pkg && !pkg.error) {
      if (!pkg.hasTestScript) {
        findings.push(this.newFinding('no-test-script', 'medium', 'Projeto sem script de teste no package.json', {
          suggestion: 'Adicionar "test" aos scripts para permitir verificação automática'
        }))
      }
      if (!pkg.hasBuildScript) {
        findings.push(this.newFinding('no-build-script', 'low', 'Projeto sem script de build no package.json', {
          suggestion: 'Adicionar "build" aos scripts (mesmo que simples) para validação de build'
        }))
      }
    }

    // Arquivos temporários na raiz
    for (const file of snapshot.files.codeFiles) {
      if (/^_check\d*\.txt$|^_tmp|^temp_/.test(file.name) || /_check\d*\.txt$/.test(file.path)) {
        findings.push(this.newFinding('temp-files', 'low', `Arquivo temporário na raiz: ${file.path}`, {
          file: file.path,
          suggestion: 'Remover ou mover para uma pasta temporária ignorada pelo Git'
        }))
      }
    }

    // Git não inicializado
    if (snapshot.git && !snapshot.git.isRepo) {
      findings.push(this.newFinding('no-git', 'medium', 'Projeto sem repositório Git inicializado', {
        suggestion: 'Executar "git init" para controle de versão e histórico seguro'
      }))
    }
  }

  dedupe(findings) {
    const seen = new Set()
    return findings.filter(f => {
      if (seen.has(f.id)) return false
      seen.add(f.id)
      return true
    })
  }

  async analyze(contextSnapshot) {
    const snapshot = contextSnapshot || await this.context.observe()
    const findings = []
    const codeFiles = snapshot.files.codeFiles || []

    for (const file of codeFiles) {
      const content = this.context.readFile(file.path, 300000)
      if (content) {
        this.analyzeFile(file.path, content, findings)
      }
    }

    findings.push(...this.findDuplicateFunctions(codeFiles))
    this.checkProjectHealth(snapshot, findings)

    // Enriquecer com memória: problemas conhecidos não repetidos como novos
    const severityOrder = { high: 0, medium: 1, low: 2 }
    const deduped = this.dedupe(findings).sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

    return {
      analyzedAt: new Date().toISOString(),
      totalFindings: deduped.length,
      counts: {
        high: deduped.filter(f => f.severity === 'high').length,
        medium: deduped.filter(f => f.severity === 'medium').length,
        low: deduped.filter(f => f.severity === 'low').length
      },
      findings: deduped
    }
  }
}

module.exports = CodeAnalyzer
