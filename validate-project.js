/* =========================================================
   ITA Browser — Validador do projeto
   Usado por: npm test / npm run build
   Verifica a sintaxe de todos os arquivos .js do projeto
   ========================================================= */

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname)
const ignore = new Set(['node_modules', '.git', '.ita-agent', 'dist', 'out', 'build_output'])

function collectJsFiles(dir, acc = []) {
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (ignore.has(entry.name)) continue
      collectJsFiles(full, acc)
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      acc.push(full)
    }
  }
  return acc
}

const files = collectJsFiles(root)
const failures = []

for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe', timeout: 30000 })
  } catch (err) {
    failures.push({
      file: path.relative(root, file),
      error: String((err.stderr && err.stderr.toString()) || err.message)
    })
  }
}

console.log(`ITA Browser — validação de sintaxe: ${files.length - failures.length}/${files.length} arquivos OK`)

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`\nERRO em ${failure.file}:\n${failure.error}`)
  }
  process.exit(1)
}

console.log('Todos os arquivos JavaScript passaram na verificação de sintaxe.')
