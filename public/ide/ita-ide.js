/* =========================================================
   ITA IDE WORKSPACE — lógica da interface
   ---------------------------------------------------------
   • Navegador: histórico próprio + proxy interno quando disponível
     (probe: o proxy responde /proxy?url=https://example.com com 200;
      na Vercel a rota não existe → modo direto com iframe)
   • Editor: executa o código em sandbox (iframe srcdoc) e captura
     console.log/info/warn/error via postMessage
   ========================================================= */
(() => {
  'use strict'

  const SEARCH_URL = 'https://www.google.com/search?q='
  const PROXY_PROBE = '/proxy?url=' + encodeURIComponent('https://example.com')

  const frame = document.getElementById('browserFrame')
  const home = document.getElementById('homeScreen')
  const urlInput = document.getElementById('urlInput')
  const lockIcon = document.getElementById('lockIcon')
  const backBtn = document.getElementById('backBtn')
  const fwdBtn = document.getElementById('fwdBtn')
  const reloadBtn = document.getElementById('reloadBtn')
  const homeBtn = document.getElementById('homeBtn')
  const goBtn = document.getElementById('goBtn')
  const modeChip = document.getElementById('modeChip')
  const modeHint = document.getElementById('modeHint')
  const pageState = document.getElementById('pageState')
  const editor = document.getElementById('editor')
  const runBtn = document.getElementById('runBtn')
  const clearBtn = document.getElementById('clearConsoleBtn')
  const consoleOut = document.getElementById('consoleOut')
  const consoleCount = document.getElementById('consoleCount')

  const state = { history: [null], index: 0, useProxy: false }
  let consoleTotal = 0

  // =========================================================
  // NAVEGAÇÃO
  // =========================================================

  function looksLikeHost(input) {
    if (/^localhost(:\d+)?([/?#]|$)/i.test(input)) return true
    if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?([/?#]|$)/.test(input)) return true
    return /^[a-z\d-]+(\.[a-z\d-]+)+(:\d+)?([/?#].*)?$/i.test(input)
  }

  /** Hosts sem TLS disponível (loopback/rede privada) podem manter http://. */
  function isInsecureHostUrl(url) {
    try {
      const { hostname } = new URL(url)
      return (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname.endsWith('.local') ||
        /^10\./.test(hostname) ||
        /^192\.168\./.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
      )
    } catch {
      return false
    }
  }

  /** Converte o que o usuário digitou em URL (ou busca). */
  function normalizeInput(raw) {
    const input = String(raw || '').trim()
    if (!input) return null
    if (/^https?:\/\//i.test(input)) {
      // Mixed Content: dentro de um site HTTPS, conteúdo http:// é bloqueado
      // pelo Chrome. Faz upgrade para https:// (exceto hosts locais, sem TLS).
      if (/^http:\/\//i.test(input) && !isInsecureHostUrl(input)) {
        return `https://${input.slice(7)}`
      }
      return input
    }
    if (/^(about|data|view-source|javascript):/i.test(input)) return null
    if (looksLikeHost(input)) return `https://${input}`
    return SEARCH_URL + encodeURIComponent(input)
  }

  function hostOf(u) {
    try {
      return new URL(u).hostname
    } catch {
      return ''
    }
  }

  /** No desktop usa o proxy interno (contorna X-Frame-Options); no site, direto. */
  function resolveTarget(realUrl) {
    return state.useProxy ? `/proxy?url=${encodeURIComponent(realUrl)}` : realUrl
  }

  function pushHistory(u) {
    if (state.history[state.index] === u) return
    state.history = state.history.slice(0, state.index + 1)
    state.history.push(u)
    state.index = state.history.length - 1
  }

  function updateNav() {
    backBtn.disabled = state.index <= 0
    fwdBtn.disabled = state.index >= state.history.length - 1
  }

  function showHome(visible) {
    home.classList.toggle('hidden', !visible)
    frame.classList.toggle('visible', !visible)
  }

  function setLock(realUrl) {
    const secure = realUrl.startsWith('https:')
    lockIcon.textContent = secure ? '🔒' : '⚠️'
    lockIcon.title = secure ? 'Conexão segura (HTTPS)' : 'Conexão não criptografada (HTTP)'
    lockIcon.style.filter = secure ? 'none' : 'grayscale(0)'
  }

  function navigate(realUrl, opts = {}) {
    const push = opts.push !== false
    if (!realUrl) {
      showHome(true)
      urlInput.value = ''
      lockIcon.textContent = ''
      if (push) pushHistory(null)
      updateNav()
      pageState.textContent = 'Página inicial'
      return
    }
    showHome(false)
    if (push) pushHistory(realUrl)
    frame.setAttribute('src', resolveTarget(realUrl))
    urlInput.value = realUrl
    setLock(realUrl)
    pageState.textContent = `Carregando ${hostOf(realUrl) || '…'}…`
    updateNav()
  }

  function goBack() {
    if (state.index <= 0) return
    state.index--
    navigate(state.history[state.index], { push: false })
  }

  function goForward() {
    if (state.index >= state.history.length - 1) return
    state.index++
    navigate(state.history[state.index], { push: false })
  }

  function goHome() {
    navigate(null)
  }

  function reload() {
    const current = state.history[state.index]
    if (!current) return
    try {
      frame.contentWindow.location.reload()
    } catch {
      frame.setAttribute('src', resolveTarget(current))
    }
    pageState.textContent = `Recarregando ${hostOf(current) || '…'}…`
  }

  frame.addEventListener('load', () => {
    const current = state.history[state.index]
    if (current) pageState.textContent = `Concluído — ${hostOf(current) || current}`
  })

  // =========================================================
  // BINDINGS DO NAVEGADOR
  // =========================================================

  goBtn.addEventListener('click', () => navigate(normalizeInput(urlInput.value)))
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') navigate(normalizeInput(urlInput.value))
  })
  backBtn.addEventListener('click', goBack)
  fwdBtn.addEventListener('click', goForward)
  reloadBtn.addEventListener('click', reload)
  homeBtn.addEventListener('click', goHome)
  document.querySelectorAll('.quick-links button').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.url))
  })

  // =========================================================
  // PROBE DO PROXY + MENSAGENS DO SHIM (navegação interna)
  // =========================================================

  fetch(PROXY_PROBE, { cache: 'no-store' })
    .then((r) => {
      state.useProxy = r.ok
    })
    .catch(() => {
      state.useProxy = false
    })
    .finally(() => {
      if (state.useProxy) {
        modeChip.textContent = '🛡 Proxy ITA ativo'
        modeChip.classList.add('chip-green')
        modeHint.textContent =
          'Navegação protegida: as páginas passam pelo proxy interno do ITA Navegador (sem bloqueios de X-Frame-Options).'
      } else {
        modeChip.textContent = '🌐 Modo direto'
        modeChip.classList.add('chip-blue')
        modeHint.textContent =
          'Sem proxy nesta origem: alguns sites podem bloquear a exibição no painel (X-Frame-Options).'
      }
    })

  // =========================================================
  // IDE — EXECUÇÃO EM SANDBOX + CONSOLE
  // =========================================================

  function appendLine(kind, text) {
    const line = document.createElement('div')
    line.className = `console-line ${kind}`
    line.textContent = text
    consoleOut.appendChild(line)
    consoleOut.scrollTop = consoleOut.scrollHeight
    consoleTotal += 1
    consoleCount.textContent = `${consoleTotal} mensagem${consoleTotal === 1 ? '' : 's'}`
  }

  const SANDBOX_HTML = (code) => `<!DOCTYPE html><html><body><script>
(function () {
  function fmt(v) {
    if (typeof v === 'string') return v
    try { return JSON.stringify(v) } catch (e) { return String(v) }
  }
  function send(kind, args) {
    try { parent.postMessage({ __itaIde: true, kind: kind, text: Array.prototype.map.call(args, fmt).join(' ') }, '*') } catch (e) {}
  }
  ['log', 'info', 'warn', 'error'].forEach(function (k) {
    var orig = console[k] ? console[k].bind(console) : function () {}
    console[k] = function () { send(k, arguments); orig.apply(null, arguments) }
  })
  window.addEventListener('error', function (e) { send('error', [e.message + ' (linha ' + e.lineno + ')']) })
  try {
${code}
  } catch (err) { send('error', [err && err.message ? err.message : String(err)]) }
})()
</script></body></html>`

  function runCode() {
    appendLine('sys', `▶ Executando (${new Date().toLocaleTimeString()})…`)
    const old = document.querySelector('iframe.sandbox')
    if (old) old.remove()
    const box = document.createElement('iframe')
    box.className = 'sandbox'
    box.style.display = 'none'
    box.setAttribute('sandbox', 'allow-scripts')
    box.srcdoc = SANDBOX_HTML(editor.value)
    document.body.appendChild(box)
  }

  window.addEventListener('message', (e) => {
    const data = e.data
    if (!data || typeof data !== 'object') return
    if (data.__itaIde === true) {
      const kind = ['log', 'info', 'warn', 'error'].includes(data.kind) ? data.kind : 'log'
      appendLine(kind, String(data.text ?? ''))
      return
    }
    // Shim do proxy: clique em link dentro da página → sincroniza barra/histórico
    if (data.type === 'ita-navigated' && typeof data.url === 'string') {
      pushHistory(data.url)
      urlInput.value = data.url
      setLock(data.url)
      updateNav()
      pageState.textContent = `Concluído — ${hostOf(data.url) || data.url}`
    }
  })

  runBtn.addEventListener('click', runCode)
  clearBtn.addEventListener('click', () => {
    consoleOut.innerHTML = ''
    consoleTotal = 0
    consoleCount.textContent = '0 mensagens'
  })
  editor.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      runCode()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const start = editor.selectionStart
      const end = editor.selectionEnd
      editor.value = editor.value.slice(0, start) + '  ' + editor.value.slice(end)
      editor.selectionStart = editor.selectionEnd = start + 2
    }
  })

  // =========================================================
  // START
  // =========================================================

  appendLine('sys', 'ITA IDE Workspace pronto. Escreva o código e clique em Executar (Ctrl+Enter).')
  updateNav()
})()