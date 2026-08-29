/* =========================================================
   ITA AI — Edit Applier
   Edições de código (🟡) com backup automático + diff real
   ========================================================= */

const fs = require('fs')
const path = require('path')

class EditApplier {
  constructor(projectRoot, backupDir) {
    this.root = projectRoot || path.join(__dirname, '..', '..', '..')
    this.backupDir = backupDir || path.join(this.root, '.ita-agent', 'backups')
    this.proposals = new Map()
    this.counter = 0
  }

  ensureBackupDir() {
    try {
      if (!fs.existsSync(this.backupDir)) fs.mkdirSync(this.backupDir, { recursive: true })
    } catch (err) {
      console.error('EditApplier: falha ao criar pasta de backup:', err.message)
    }
  }

  resolveSafe(relativePath) {
    const resolved = path.resolve(this.root, relativePath)
    const normalizedRoot = path.resolve(this.root)
    if (!resolved.startsWith(normalizedRoot)) {
      return { ok: false, error: 'Caminho fora do diretório do projeto' }
    }
    return { ok: true, resolved, relative: path.relative(normalizedRoot, resolved).replace(/\\/g, '/') }
  }

  makeDiff(oldContent, newContent, relativePath) {
    const oldLines = String(oldContent).split('\n')
    const newLines = String(newContent).split('\n')

    let start = 0
    while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start++

    let endOld = oldLines.length - 1
    let endNew = newLines.length - 1
    while (endOld >= start && endNew >= start && oldLines[endOld] === newLines[endNew]) {
      endOld--
      endNew--
    }

    const removed = oldLines.slice(start, endOld + 1)
    const added = newLines.slice(start, endNew + 1)
    const diffLines = []
    diffLines.push(`--- ${relativePath} (atual)`)
    diffLines.push(`+++ ${relativePath} (proposto)`)
    diffLines.push(`@@ -${start + 1},${removed.length} +${start + 1},${added.length} @@`)
    removed.forEach(line => diffLines.push(`- ${line}`))
    added.forEach(line => diffLines.push(`+ ${line}`))
    return diffLines.join('\n')
  }

  proposeEdit({ file, newContent, description }) {
    const safe = this.resolveSafe(file)
    if (!safe.ok) return { success: false, error: safe.error }

    let oldContent = ''
    const exists = fs.existsSync(safe.resolved)
    if (exists) {
      try {
        oldContent = fs.readFileSync(safe.resolved, 'utf-8')
      } catch (err) {
        return { success: false, error: `Falha ao ler arquivo: ${err.message}` }
      }
    }

    if (exists && oldContent === newContent) {
      return { success: false, error: 'Conteúdo proposto é idêntico ao atual — nada a fazer' }
    }

    this.counter += 1
    const id = `edit-${Date.now()}-${this.counter}`
    const diff = this.makeDiff(oldContent, newContent, safe.relative)

    const proposal = {
      id,
      kind: exists ? 'edit' : 'create',
      file: safe.relative,
      absolutePath: safe.resolved,
      oldContent,
      newContent,
      diff,
      description: description || (exists ? `Editar ${safe.relative}` : `Criar ${safe.relative}`),
      status: 'pending',
      createdAt: new Date().toISOString()
    }

    this.proposals.set(id, proposal)
    return { success: true, proposal: this.serialize(proposal) }
  }

  applyProposal(id) {
    const proposal = this.proposals.get(id)
    if (!proposal) return { success: false, error: 'Proposta não encontrada' }
    if (proposal.status === 'applied') return { success: false, error: 'Proposta já aplicada' }
    if (proposal.status === 'rejected') return { success: false, error: 'Proposta rejeitada' }

    this.ensureBackupDir()

    try {
      if (fs.existsSync(proposal.absolutePath)) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        const backupName = `${stamp}__${path.basename(proposal.absolutePath)}`
        fs.writeFileSync(path.join(this.backupDir, backupName), proposal.oldContent, 'utf-8')
        proposal.backupFile = path.join(this.backupDir, backupName)
      }

      const dir = path.dirname(proposal.absolutePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

      fs.writeFileSync(proposal.absolutePath, proposal.newContent, 'utf-8')
      proposal.status = 'applied'
      proposal.appliedAt = new Date().toISOString()

      return { success: true, proposal: this.serialize(proposal), backupFile: proposal.backupFile || null }
    } catch (err) {
      return { success: false, error: `Falha ao aplicar edição: ${err.message}`, proposal: this.serialize(proposal) }
    }
  }

  rejectProposal(id, reason) {
    const proposal = this.proposals.get(id)
    if (!proposal) return { success: false, error: 'Proposta não encontrada' }
    proposal.status = 'rejected'
    proposal.rejectionReason = reason || null
    return { success: true, proposal: this.serialize(proposal) }
  }

  getProposal(id) {
    const proposal = this.proposals.get(id)
    return proposal ? this.serialize(proposal) : null
  }

  listProposals() {
    return [...this.proposals.values()].map(p => this.serialize(p))
  }

  serialize(proposal) {
    const { oldContent, newContent, absolutePath, ...rest } = proposal
    return {
      ...rest,
      oldSize: oldContent.length,
      newSize: newContent.length
    }
  }
}

module.exports = EditApplier
