#!/usr/bin/env node
/*
=========================================================
  ITA NAVEGADOR — AUTO-DEPLOY
  Automação de publicação: git add → commit → push
  (origin deploy-site) → build do instalador (npm run dist).

  Uso:
    node auto-deploy.js
    node auto-deploy.js --dry-run   (simula sem executar nada)

  A mensagem do commit é capturada via readline; se o
  usuário pressionar apenas Enter, aplica o fallback
  "Atualização automática do sistema".
=========================================================
*/

'use strict'

const { exec } = require('child_process')
const readline = require('readline')
const path = require('path')

const ROOT = __dirname
const DRY_RUN = process.argv.includes('--dry-run')
const TARGET_BRANCH = 'deploy-site'
const FALLBACK_MESSAGE = 'Atualização automática do sistema'

/*
=========================================================
  RUNCOMMAND — promessa do processo exec
=========================================================
*/

function runCommand (command) {
  return new Promise((resolve, reject) => {
    // Correção da diretriz 1: console.log (console.exec não existe
    // no Node — a chamada antiga quebraria a aplicação com TypeError)
    console.log(`\n▶ Executando: ${command}`)
    if (DRY_RUN) {
      console.log('   [dry-run] comando simulado.')
      return resolve('')
    }

    exec(command, { cwd: ROOT, windowsHide: true }, (error, stdout, stderr) => {
      if (stdout && stdout.trim()) console.log(stdout.trim())
      if (stderr && stderr.trim()) console.log(stderr.trim())

      if (error) {
        reject(
          new Error(
            `"${command}" falhou (exit ${error.code ?? '?'}). ` +
            `${(stderr || error.message).trim()}`
          )
        )
        return
      }
      resolve(stdout || '')
    })
  })
}

/*
=========================================================
  READLINE — captura da mensagem do commit
=========================================================
*/

function askCommitMessage (rl) {
  return new Promise((resolve) => {
    rl.question(
      `\n✎ Mensagem do commit (Enter = "${FALLBACK_MESSAGE}"): `,
      (answer) => resolve(answer.trim() || FALLBACK_MESSAGE)
    )
  })
}

/*
=========================================================
  FLUXO PRINCIPAL — sequência assíncrona garantida
=========================================================
*/

async function main () {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  try {
    if (DRY_RUN) console.log('⚠ MODO DRY-RUN — nenhum comando real será executado.\n')

    /* Pre-flight: garante que estamos no branch correto,
       pois o push é fixo para origin deploy-site
       (executado apenas em modo real — no dry-run o
       comando é simulado e não retornaria branch) */
    if (DRY_RUN) {
      console.log('✔ [dry-run] Pre-flight de branch simulado: ' + TARGET_BRANCH)
    } else {
      const branch = (await runCommand('git rev-parse --abbrev-ref HEAD')).trim()
      if (branch !== TARGET_BRANCH) {
        throw new Error(
          `Branch atual é "${branch}", mas o deploy publica "${TARGET_BRANCH}". ` +
          `Faça checkout: git checkout ${TARGET_BRANCH}`
        )
      }
      console.log(`✔ Branch confirmado: ${branch}`)
    }

    const message = await askCommitMessage(rl)
    console.log(`\n📌 Iniciando deploy com a mensagem: "${message}"`)

    /* Sequência obrigatória: add → commit → push → dist */
    await runCommand('git add .')
    await runCommand(`git commit -m "${message.replace(/"/g, "'")}"`)
    await runCommand('git push origin deploy-site')
    await runCommand('npm run dist')

    console.log('\n🎉 Deploy concluído com sucesso!')
    console.log('   Instalador gerado em ./release e branch deploy-site atualizado.')
    console.log('   Publique a release com: npm run release')
  } catch (error) {
    /* Diretriz 3: falha amigável + fechamento adequado do readline */
    console.error('\n❌ [Auto-Deploy] Falha na automação:', error.message)
    console.error('   Corrija o problema e execute novamente: node auto-deploy.js')
  } finally {
    rl.close()
  }
}

main()
