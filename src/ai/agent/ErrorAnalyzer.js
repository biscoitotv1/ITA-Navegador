/* =========================================================
   ITA AI — Error Analyzer
   Analisa erros reais de build/teste e propõe correções
   ========================================================= */

const path = require('path')

class ErrorAnalyzer {
  constructor(contextEngine) {
    this.context = contextEngine
  }

  parse(errorText) {
    const text = String(errorText || '')
    if (!text.trim()) {
      return { hasErrors: false, summary: null, errors: [] }
    }

    const errors = []
    const rules = [
      {
        type: 'missing-module',
        pattern: /Cannot find module ['"]([^'"]+)['"]/,
        suggestion: match => match[1].startsWith('.')
          ? `O caminho relativo "${match[1]}" não existe — verificar nome e localização do arquivo`
          : `Executar "npm install ${match[1].split('/')[0]}" ou corrigir o nome do módulo`
      },
      {
        type: 'syntax-error',
        pattern: /(SyntaxError:.*)/,
        suggestion: match => `Erro de sintaxe: revisar a linha indicada (${match[1].slice(0, 120)})`
      },
      {
        type: 'type-error',
        pattern: /(TypeError:.*)/,
        suggestion: match => `Erro de tipo: validar se o objeto/valor existe antes de usar (${match[1].slice(0, 120)})`
      },
      {
        type: 'reference-error',
        pattern: /(ReferenceError:.*)/,
        suggestion: match => `Referência indefinida: declarar ou importar o identificador (${match[1].slice(0, 120)})`
      },
      {
        type: 'port-in-use',
        pattern: /(EADDRINUSE[^\n]*)/,
        suggestion: () => 'Porta já em uso: encerrar o processo antigo ou usar outra porta'
      },
      {
        type: 'permission',
        pattern: /(EACCES|EPERM)[^\n]*/,
        suggestion: () => 'Permissão negada: verificar permissões do arquivo/pasta'
      },
      {
        type: 'not-found',
        pattern: /(ENOENT[^\n]*)/,
        suggestion: () => 'Arquivo ou diretório inexistente: verificar o caminho informado'
      },
      {
        type: 'npm-error',
        pattern: /npm ERR! ([^\n]+)/,
        suggestion: match => `Falha do npm: ${match[1].slice(0, 140)}`
      }
    ]

    for (const rule of rules) {
      const matches = [...text.matchAll(new RegExp(rule.pattern, 'g'))]
      for (const match of matches.slice(0, 5)) {
        const location = this.findLocation(text, match.index)
        errors.push({
          type: rule.type,
          raw: match[0].slice(0, 300),
          file: location ? location.file : null,
          line: location ? location.line : null,
          column: location ? location.column : null,
          suggestion: rule.suggestion(match)
        })
      }
    }

    return {
      hasErrors: errors.length > 0,
      summary: errors.length > 0 ? `${errors.length} erro(s) identificado(s): ${errors.map(e => e.type).join(', ')}` : 'Nenhum erro reconhecido no texto',
      errors: this.dedupe(errors)
    }
  }

  findLocation(text, fromIndex) {
    const window = text.slice(Math.max(0, fromIndex - 200), fromIndex + 300)
    const locationMatch = window.match(/([\w\-\\\/. ]+\.(?:js|json|html|css)):(\d+)(?::(\d+))?/)
    if (locationMatch) {
      return {
        file: locationMatch[1],
        line: parseInt(locationMatch[2], 10),
        column: locationMatch[3] ? parseInt(locationMatch[3], 10) : null
      }
    }
    return null
  }

  dedupe(errors) {
    const seen = new Set()
    return errors.filter(error => {
      const key = `${error.type}:${error.raw}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  readFileAt(file, line, context = 6) {
    if (!file) return null
    const content = this.context.readFile(file)
    if (!content || !line) return null
    const lines = content.split('\n')
    const start = Math.max(0, line - context - 1)
    const end = Math.min(lines.length, line + context)
    return {
      file,
      line,
      excerpt: lines.slice(start, end).map((text, index) => `${start + index + 1}: ${text}`).join('\n')
    }
  }

  buildFixSuggestions(parsed) {
    if (!parsed.hasErrors) return []
    return parsed.errors.map(error => {
      const excerpt = this.readFileAt(error.file, error.line)
      return {
        ...error,
        excerpt: excerpt ? excerpt.excerpt : null,
        fixStrategy: error.type === 'missing-module'
          ? 'command'
          : error.type === 'syntax-error' || error.type === 'type-error' || error.type === 'reference-error'
            ? 'edit'
            : 'manual'
      }
    })
  }
}

module.exports = ErrorAnalyzer
