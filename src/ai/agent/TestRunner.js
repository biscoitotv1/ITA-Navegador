/* =========================================================
   ITA AI — Test Runner
   Nível 5: Verificar de verdade o que foi alterado
   ========================================================= */

const path = require('path')

class TestRunner {
  constructor(commandRunner, contextEngine) {
    this.runner = commandRunner
    this.context = contextEngine
    this.lastVerification = null
  }

  async syntaxCheck(files) {
    const results = []
    for (const file of files) {
      if (!/\.js$/i.test(file)) continue
      const full = path.join(this.context.root, file)
      const command = `node --check "${full}"`
      const outcome = await this.runner.run(command, { timeout: 30000 })
      results.push({
        file,
        check: 'syntax',
        passed: outcome.executed && outcome.exitCode === 0,
        exitCode: outcome.exitCode,
        stderr: outcome.stderr ? outcome.stderr.slice(0, 2000) : '',
        message: outcome.executed
          ? (outcome.exitCode === 0 ? 'Sintaxe válida' : 'Erro de sintaxe detectado')
          : outcome.message
      })
    }
    return results
  }

  async runTests() {
    const pkg = this.context.readPackage()
    const results = []

    if (pkg.error) {
      return { passed: false, results: [{ check: 'package', passed: false, message: `package.json ilegível: ${pkg.error}` }] }
    }

    if (pkg.hasTestScript) {
      const outcome = await this.runner.run('npm test', { timeout: 180000 })
      results.push({
        check: 'npm test',
        passed: outcome.executed && outcome.exitCode === 0,
        exitCode: outcome.exitCode,
        stdout: outcome.stdout ? outcome.stdout.slice(-4000) : '',
        stderr: outcome.stderr ? outcome.stderr.slice(-4000) : '',
        message: outcome.message
      })
    } else {
      results.push({ check: 'npm test', passed: true, skipped: true, message: 'Sem script de teste configurado — verificação ignorada' })
    }

    if (pkg.hasBuildScript) {
      const outcome = await this.runner.run('npm run build', { timeout: 180000 })
      results.push({
        check: 'npm run build',
        passed: outcome.executed && outcome.exitCode === 0,
        exitCode: outcome.exitCode,
        stdout: outcome.stdout ? outcome.stdout.slice(-4000) : '',
        stderr: outcome.stderr ? outcome.stderr.slice(-4000) : '',
        message: outcome.message
      })
    } else {
      results.push({ check: 'npm run build', passed: true, skipped: true, message: 'Sem script de build configurado — verificação ignorada' })
    }

    return {
      passed: results.every(r => r.passed),
      results
    }
  }

  async verify(changedFiles = []) {
    const syntaxResults = await this.syntaxCheck(changedFiles)
    const testResults = await this.runTests()
    const all = [...syntaxResults, ...testResults.results]

    const verification = {
      verifiedAt: new Date().toISOString(),
      passed: all.every(r => r.passed),
      syntaxOk: syntaxResults.every(r => r.passed),
      results: all,
      changedFiles
    }

    this.lastVerification = verification
    return verification
  }

  getLastVerification() {
    return this.lastVerification
  }
}

module.exports = TestRunner
