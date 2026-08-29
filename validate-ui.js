/* Validador final: IDs usados x definidos + sintaxe JS */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const root = __dirname
const results = { idCheck: null, syntax: [], fail: 0 }

try {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  const used = new Set()
  for (const f of ['index.html', 'ita-agent-ui.js']) {
    const t = fs.readFileSync(path.join(root, f), 'utf8')
    for (const m of t.matchAll(/getElementById\(['"]([\w-]+)['"]\)/g)) used.add(m[1])
  }
  const defined = new Set()
  for (const m of html.matchAll(/id="([\w-]+)"/g)) defined.add(m[1])
  const missing = [...used].filter(i => !defined.has(i))
  results.idCheck = missing.length === 0
    ? `OK — ${used.size} IDs usados, todos definidos`
    : `FALTANDO: ${missing.join(', ')}`
  if (missing.length) results.fail++
} catch (err) {
  results.idCheck = `ERRO: ${err.message}`
  results.fail++
}

const jsFiles = []
const walk = dir => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.ita-agent'].includes(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name.endsWith('.js')) jsFiles.push(full)
  }
}
walk(root)

for (const file of jsFiles) {
  try {
    execFileSync('node', ['--check', file], { stdio: 'pipe' })
    results.syntax.push(`OK ${path.relative(root, file)}`)
  } catch (err) {
    results.syntax.push(`ERRO ${path.relative(root, file)}: ${String(err.stderr || err.message).slice(0, 200)}`)
    results.fail++
  }
}

console.log('=== ID CHECK ===')
console.log(results.idCheck)
console.log('=== SINTAXE JS (' + results.syntax.length + ' arquivos) ===')
for (const line of results.syntax) console.log(line)
console.log('=== RESULTADO ===')
console.log(results.fail === 0 ? 'TUDO OK ✔' : `FALHAS: ${results.fail}`)
process.exit(results.fail === 0 ? 0 : 1)
