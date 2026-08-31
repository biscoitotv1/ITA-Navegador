const path = require('path')
const fs = require('fs')
const http = require('http')
const https = require('https')
const electron = require('electron')

if (process.defaultApp) {
  if (process.argv.length >= 3) {
    electron.app.setAppPath(process.argv[2])
  }
}

const userDataPath = electron.app.getPath('userData')
const favoritesPath = path.join(userDataPath, 'favorites.json')
let favorites = []

function loadFavorites() {
  try {
    if (fs.existsSync(favoritesPath)) {
      favorites = JSON.parse(fs.readFileSync(favoritesPath, 'utf-8'))
    }
  } catch {
    favorites = []
  }
}

function saveFavorites() {
  try {
    fs.writeFileSync(favoritesPath, JSON.stringify(favorites, null, 2))
  } catch {
    // ignore
  }
}

loadFavorites()

const AppCore = require('./src/core/AppCore')
const BrowserModule = require('./src/browser/BrowserModule')
const StudioModule = require('./src/studio/StudioModule')
const EditorModule = require('./src/editor/EditorModule')
const ProjectManager = require('./src/studio/ProjectManager')
const ITAAI = require('./src/ai/ITA_AI')
const NetworkManager = require('./src/networking/NetworkManager')
const BuildSystem = require('./src/build/BuildSystem')
const PhysicsEngine = require('./src/physics/PhysicsEngine')
const AudioSystem = require('./src/audio/AudioSystem')
const ScriptEditor = require('./src/editor/ScriptEditor')
const LocalServer = require('./src/server/LocalServer')
const Agent = require('./src/ai/agent')

AppCore.register('browser', BrowserModule)
AppCore.register('studio', StudioModule)
AppCore.register('editor', EditorModule)
AppCore.register('project', ProjectManager)
AppCore.register('ai', ITAAI)
AppCore.register('network', NetworkManager)
AppCore.register('build', BuildSystem)
AppCore.register('physics', PhysicsEngine)
AppCore.register('audio', AudioSystem)
AppCore.register('scriptEditor', ScriptEditor)

// ===== ITA AI — Agent Core (Observar → Analisar → Planejar → Executar → Verificar) =====
Agent.setAiProvider(ITAAI)

let mainWindow
let localServerUrl = 'http://localhost:8080'

const downloads = []

// Referências aos DownloadItems ativos (para cancelamento)
const downloadItems = new Map()

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

// ===== Proteção contra páginas maliciosas (avaliação de URL) =====
// Modelo: safe (bloqueia) | warn (só avisa) — sem falsos positivos
const BLOCKED_URL_PATTERNS = [
  { pattern: /\.(exe|bat|cmd|scr|vbs|msi|ps1)(\?|$)/i, reason: 'Arquivo executável potencialmente perigoso' },
  { pattern: /(login|signin|secure|account|update|verify|bank|banco)[^\s]*(\.xyz|\.top|\.buzz|\.click|\.gq|\.tk)/i, reason: 'Padrão comum de página de phishing' }
]

const WARN_URL_PATTERNS = [
  { pattern: /^(bit\.ly|tinyurl\.com|shorturl\.at|is\.gd|cutt\.ly|rebrand\.ly)$/i, reason: 'Encurtador de URL (destino oculto)' }
]

function evaluateUrlSafety(targetUrl) {
  const verdict = { url: targetUrl, safe: true, warn: false, reason: null, checkedAt: new Date().toISOString() }
  try {
    const parsed = new URL(targetUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return verdict // esquemas internos (ita://, about:, file:) passam
    }

    const host = parsed.hostname.toLowerCase()

    // IP cru em vez de domínio (comum em phishing)
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      verdict.safe = false
      verdict.reason = 'Endereço IP cru em vez de domínio (comum em phishing)'
      return verdict
    }

    // Truque de credenciais: https://google.com@evil.com/
    if (parsed.username) {
      verdict.safe = false
      verdict.reason = 'URL disfarçada com credenciais (@) — destino oculto'
      return verdict
    }

    const target = host + parsed.pathname
    for (const rule of BLOCKED_URL_PATTERNS) {
      if (rule.pattern.test(target)) {
        verdict.safe = false
        verdict.reason = rule.reason
        return verdict
      }
    }

    for (const rule of WARN_URL_PATTERNS) {
      if (rule.pattern.test(host)) {
        verdict.warn = true
        verdict.reason = rule.reason
        return verdict
      }
    }

    if (parsed.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(host)) {
      verdict.warn = true
      verdict.reason = 'Conexão sem criptografia (HTTP)'
    }
  } catch {
    // URLs inválidas/internas: permitir
  }
  return verdict
}

function evaluateRequestSafety(details) {
  // Requisições ao proxy carregam o destino real em ?url=
  try {
    const parsed = new URL(details.url)
    if (parsed.pathname === '/proxy') {
      const target = parsed.searchParams.get('url')
      if (target) return evaluateUrlSafety(target)
    }
  } catch {
    // segue para avaliação padrão
  }
  return evaluateUrlSafety(details.url)
}

// ===== Restauração de sessão (abas da última execução) =====
const sessionPath = path.join(electron.app.getPath('userData'), 'ita-session.json')

function readSessionFile() {
  try {
    if (fs.existsSync(sessionPath)) {
      return JSON.parse(fs.readFileSync(sessionPath, 'utf-8'))
    }
  } catch {
    // arquivo corrompido: recomeçar
  }
  return { tabs: [], savedAt: null }
}

function saveSessionFile(data) {
  try {
    fs.writeFileSync(sessionPath, JSON.stringify(data, null, 2))
  } catch {
    // falha silenciosa: não deve quebrar o navegador
  }
}

// ===== UI PRINCIPAL — deploy da Vercel com fallback para o arquivo local =====
// A janela principal carrega a interface hospedada no deploy da branch main
// (Vercel). Se o deploy estiver inacessível — sem internet, proteção SSO da
// Vercel ativa ou erro do servidor — o app cai automaticamente para o
// index.html local, evitando tela branca ou a página de login da Vercel.
//   ITA_UI_URL=<url>   → usa outra URL remota (ex.: .../ui/ para a UI do navegador)
//   ITA_UI_URL=local   → força sempre o arquivo local (ignora a rede)
const DEFAULT_REMOTE_UI_URL = 'https://ita-navegador-g6jv-git-main-biscoitotv1-1912s-projects.vercel.app'

function getRemoteUiUrl() {
  const configured = process.env.ITA_UI_URL
  if (!configured || configured === 'default') return DEFAULT_REMOTE_UI_URL
  return configured === 'local' ? null : configured
}

// Sonda: o deploy responde com a nossa UI (e não com o muro de login da Vercel)?
function probeRemoteUi(remoteUrl) {
  return new Promise((resolve) => {
    let settled = false
    let req = null
    const done = (ok) => {
      if (settled) return
      settled = true
      try { if (req) req.destroy() } catch { /* conexão já encerrada */ }
      resolve(ok)
    }
    try {
      const lib = remoteUrl.startsWith('http://') ? http : https
      req = lib.request(remoteUrl, { method: 'GET', timeout: 8000 }, (res) => {
        // Deploy protegido por SSO redireciona para vercel.com → não é a nossa UI
        if (res.statusCode < 200 || res.statusCode >= 400) {
          res.resume()
          done(false)
          return
        }
        let body = ''
        res.setEncoding('utf-8')
        res.on('data', (chunk) => {
          body += chunk
          // Marcador da nossa interface aparece no início do HTML
          if (/ITA Navegador|itaBrowser|ita-ui/i.test(body)) done(true)
        })
        res.on('end', () => done(/ITA Navegador|itaBrowser|ita-ui/i.test(body)))
        res.on('error', () => done(false))
      })
      req.on('timeout', () => done(false))
      req.on('error', () => done(false))
      req.end()
    } catch {
      resolve(false)
    }
  })
}

async function loadMainUi() {
  let restored = false
  const restoreOnce = () => {
    if (restored) return
    restored = true
    sendToRenderer('restore-session', readSessionFile())
  }
  const loadLocalUi = () => mainWindow.loadFile(path.join(__dirname, 'index.html'))

  mainWindow.webContents.once('did-finish-load', restoreOnce)

  const remoteUrl = getRemoteUiUrl()
  if (remoteUrl && await probeRemoteUi(remoteUrl)) {
    // Se a rede cair durante o uso (falha no quadro principal), cai para o local
    mainWindow.webContents.once('did-fail-load', (_event, errorCode, _desc, _url, isMainFrame) => {
      if (!isMainFrame || restored || errorCode === -3) return // -3 = carga substituída
      loadLocalUi()
    })
    mainWindow.loadURL(remoteUrl)
  } else {
    loadLocalUi()
  }
}

async function createWindow() {
  try {
    const serverResult = await LocalServer.start()
    localServerUrl = serverResult.url
    console.log('Local server ready at', localServerUrl)
  } catch (err) {
    console.error('Failed to start local server:', err)
    localServerUrl = 'http://localhost:8080'
  }

  mainWindow = new electron.BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'ITA Browser',
    // ===== ITA CHROME: moldura nativa removida =====
    // A barra de títulos é desenhada pelo próprio app (index.html).
    // O overlay mantém os botões nativos (min/max/fechar) integrados
    // ao tema escuro — mesma técnica do VS Code no Windows.
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#161616',
      symbolColor: '#e8eef9',
      height: 38
    },
    backgroundColor: '#0d0d0d',
    // Ícone oficial da marca (gerado por scripts/generate-brand.py)
    icon: path.join(__dirname, 'public', 'brand', 'ita-logo.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  })

  // Sincroniza o estado da janela com a barra de títulos customizada
  // (ícone maximizar/restaurar e cantos arredondados no renderer)
  const pushWindowState = () => sendToRenderer('window-state-changed', {
    maximized: mainWindow.isMaximized(),
    fullscreen: mainWindow.isFullScreen()
  })
  ;['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']
    .forEach(ev => mainWindow.on(ev, pushWindowState))

  AppCore.init(mainWindow)
  EditorModule.setMainWindow(mainWindow)
  Agent.setMainWindow(mainWindow)

  const session = mainWindow.webContents.session
  session.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (details, callback) => {
    const headers = Object.assign({}, details.responseHeaders)
    delete headers['x-frame-options']
    delete headers['X-Frame-Options']
    delete headers['frame-ancestors']
    delete headers['content-security-policy']
    callback({ responseHeaders: headers })
  })

  // ===== Gerenciador de downloads com progresso =====
  session.on('will-download', (event, item) => {
    const download = {
      id: `dl-${Date.now()}`,
      filename: item.getFilename(),
      url: item.getURL(),
      path: item.getSavePath(),
      state: 'progressing',
      received: 0,
      total: item.getTotalBytes(),
      startedAt: new Date().toISOString()
    }
    downloads.push(download)
    downloadItems.set(download.id, item)

    item.on('updated', (_e, state) => {
      download.state = state === 'interrupted' ? 'interrupted' : 'progressing'
      download.received = item.getReceivedBytes()
      download.total = item.getTotalBytes()
      sendToRenderer('download-progress', download)
    })

    item.once('done', (_e, state) => {
      download.state = state
      download.finishedAt = new Date().toISOString()
      downloadItems.delete(download.id)
      sendToRenderer('download-done', download)
    })

    sendToRenderer('download-started', download)
  })

  // ===== Proteção contra páginas maliciosas =====
  // will-navigate: protege a janela principal
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    const verdict = evaluateUrlSafety(targetUrl)
    if (!verdict.safe) {
      event.preventDefault()
      sendToRenderer('security-block', verdict)
    }
  })

  // onBeforeRequest: protege também os webviews (navegação real via proxy)
  session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    if (details.resourceType === 'mainFrame') {
      const verdict = evaluateRequestSafety(details)
      if (!verdict.safe) {
        sendToRenderer('security-block', verdict)
        callback({ cancel: true })
        return
      }
      if (verdict.warn) {
        sendToRenderer('security-warning', verdict)
      }
    }
    callback({})
  })

  // ===== UI PRINCIPAL: Vercel (branch main) com fallback local offline =====
  await loadMainUi()
}

// ===== Barra de Menus Electron =====
function buildAppMenu() {
  const { Menu, dialog, shell } = electron

  const template = [
    {
      label: 'Arquivo',
      submenu: [
        {
          label: 'Abrir Pasta de Projeto',
          accelerator: 'CmdOrCtrl+Shift+O',
          async click() {
            const result = await dialog.showOpenDialog(mainWindow, {
              title: 'Abrir Pasta de Projeto',
              properties: ['openDirectory'],
              buttonLabel: 'Abrir Projeto'
            })
            if (!result.canceled && result.filePaths.length > 0) {
              const projectPath = result.filePaths[0]
              sendToRenderer('open-project-folder', { path: projectPath })
            }
          }
        },
        {
          label: 'Build Universal',
          accelerator: 'CmdOrCtrl+Shift+B',
          async click() {
            if (!mainWindow) return
            sendToRenderer('menu-build-universal', {})
            // Dispara build para todas as plataformas via BuildSystem
            const platforms = ['windows', 'linux', 'web', 'android', 'ios']
            for (const platform of platforms) {
              try {
                await BuildSystem.build(
                  electron.app.getPath('documents'),
                  { platform }
                )
              } catch (err) {
                console.error(`Build ${platform} falhou:`, err.message)
              }
            }
          }
        },
        {
          label: 'Gerenciador de Dependências',
          accelerator: 'CmdOrCtrl+Shift+D',
          click() {
            sendToRenderer('menu-dep-manager', {})
          }
        },
        { type: 'separator' },
        {
          label: 'Sair',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click() {
            electron.app.quit()
          }
        }
      ]
    },

    // ===== Edit — roles nativas do Electron (sem implementação manual) =====
    {
      label: 'Editar',
      submenu: [
        { label: 'Desfazer',      role: 'undo',      accelerator: 'CmdOrCtrl+Z' },
        { label: 'Refazer',       role: 'redo',       accelerator: 'CmdOrCtrl+Y' },
        { type: 'separator' },
        { label: 'Recortar',      role: 'cut',        accelerator: 'CmdOrCtrl+X' },
        { label: 'Copiar',        role: 'copy',       accelerator: 'CmdOrCtrl+C' },
        { label: 'Colar',         role: 'paste',      accelerator: 'CmdOrCtrl+V' },
        { label: 'Selecionar Tudo', role: 'selectAll', accelerator: 'CmdOrCtrl+A' }
      ]
    },

    // ===== View — navegação, zoom e ferramentas de desenvolvimento =====
    {
      label: 'Exibir',
      submenu: [
        {
          label: 'Recarregar Aba Atual',
          accelerator: 'CmdOrCtrl+R',
          click() {
            // Recarrega apenas a aba ativa (webview) — o renderer decide o alvo
            sendToRenderer('tab-reload', { hard: false })
          }
        },
        {
          label: 'Recarregar Aba Atual (F5)',
          accelerator: 'F5',
          click() {
            sendToRenderer('tab-reload', { hard: false })
          }
        },
        {
          label: 'Forçar Recarregamento',
          accelerator: 'CmdOrCtrl+Shift+R',
          click() {
            if (mainWindow) mainWindow.webContents.reloadIgnoringCache()
          }
        },
        {
          label: 'Inspecionar Elemento (Aba Atual)',
          accelerator: 'F12',
          click() {
            // Abre o DevTools da aba ativa (webview) ou da janela principal
            sendToRenderer('tab-devtools', {})
          }
        },
        { type: 'separator' },
        {
          label: 'Aproximar',
          role: 'zoomIn',
          accelerator: 'CmdOrCtrl+Plus'
        },
        {
          label: 'Afastar',
          role: 'zoomOut',
          accelerator: 'CmdOrCtrl+-'
        },
        {
          label: 'Zoom Padrão',
          role: 'resetZoom',
          accelerator: 'CmdOrCtrl+0'
        },
        { type: 'separator' },
        {
          label: 'Tela Cheia',
          accelerator: 'F11',
          click() {
            if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen())
          }
        }
      ]
    },

    // ===== IA — atalhos de produtividade assistida =====
    {
      label: 'IA',
      submenu: [
        {
          label: 'Comandos Rápidos da IA (Otimizar Código)',
          accelerator: 'CmdOrCtrl+Shift+I',
          async click() {
            if (!mainWindow) return
            // Captura o texto selecionado no renderer e envia ao AgentCore
            const selectedText = await mainWindow.webContents.executeJavaScript(
              'window.getSelection ? window.getSelection().toString() : ""'
            )
            if (!selectedText || !selectedText.trim()) {
              electron.dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'IA — Otimizar Código',
                message: 'Selecione um trecho de código no editor antes de usar este atalho.'
              })
              return
            }
            sendToRenderer('ai-optimize-code', { code: selectedText })
            // Dispara análise diretamente no AgentCore
            try {
              Agent.agent.runCycle(
                `Analise e otimize o seguinte trecho de código:\n\n${selectedText}`
              ).then(result => sendToRenderer('ai-optimize-result', result))
               .catch(err => sendToRenderer('ai-optimize-error', { message: err.message }))
            } catch (err) {
              console.error('AgentCore — otimização falhou:', err.message)
            }
          }
        },
        {
          label: 'Inserir Log de Diagnóstico',
          accelerator: 'CmdOrCtrl+Shift+L',
          click() {
            if (!mainWindow) return
            // Injeta console.log de diagnóstico na posição do cursor no editor
            sendToRenderer('editor-insert-diagnostic-log', {
              snippet: `console.log('[ITA-DIAG]', { ts: Date.now(), state: typeof window !== 'undefined' ? window.__ITA_STATE__ : null });`,
              timestamp: new Date().toISOString()
            })
          }
        },
        {
          label: 'Limpar Cache / Estado Local',
          accelerator: 'CmdOrCtrl+Shift+K',
          async click() {
            if (!mainWindow) return
            const { response } = await electron.dialog.showMessageBox(mainWindow, {
              type: 'question',
              title: 'Limpar Cache / Estado Local',
              message: 'Isso vai limpar localStorage, sessionStorage e recarregar a janela. Continuar?',
              buttons: ['Cancelar', 'Limpar e Recarregar'],
              defaultId: 1,
              cancelId: 0
            })
            if (response === 1) {
              await mainWindow.webContents.executeJavaScript(
                'localStorage.clear(); sessionStorage.clear();'
              )
              await mainWindow.webContents.session.clearCache()
              await mainWindow.webContents.session.clearStorageData({
                storages: ['cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage']
              })
              mainWindow.webContents.reload()
              sendToRenderer('cache-cleared', { clearedAt: new Date().toISOString() })
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Alternar Painel do Agente Automação',
          accelerator: 'CmdOrCtrl+Shift+A',
          click() {
            if (!mainWindow) return
            // Abre ou fecha o painel do Agente Automação
            sendToRenderer('toggle-ai-sidebar', {})
          }
        }
      ]
    },

    // ===== Window — controle da janela do aplicativo =====
    {
      label: 'Janela',
      submenu: [
        {
          label: 'Minimizar',
          accelerator: 'CmdOrCtrl+M',
          click() {
            if (mainWindow) mainWindow.minimize()
          }
        },
        {
          label: 'Fechar',
          accelerator: 'CmdOrCtrl+W',
          click() {
            if (mainWindow) mainWindow.close()
          }
        },
        { type: 'separator' },
        {
          label: 'Sempre no Topo',
          accelerator: 'CmdOrCtrl+Shift+T',
          type: 'checkbox',
          checked: false,
          click(menuItem) {
            if (!mainWindow) return
            const onTop = menuItem.checked
            mainWindow.setAlwaysOnTop(onTop)
            // Notifica o renderer para exibir indicador visual se houver
            sendToRenderer('always-on-top-changed', { enabled: onTop })
          }
        },
        { type: 'separator' },
        {
          label: 'Alternar Modo de Janela',
          accelerator: 'CmdOrCtrl+Shift+F',
          click() {
            if (!mainWindow) return
            if (mainWindow.isFullScreen()) {
              // Sai do fullscreen e restaura modo janela normal
              mainWindow.setFullScreen(false)
              mainWindow.unmaximize()
            } else if (mainWindow.isMaximized()) {
              // Estava maximizado — restaura tamanho anterior
              mainWindow.unmaximize()
            } else {
              // Estava em janela normal — maximiza
              mainWindow.maximize()
            }
            sendToRenderer('window-mode-changed', {
              fullscreen: mainWindow.isFullScreen(),
              maximized: mainWindow.isMaximized()
            })
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

electron.app.whenReady().then(async () => {
  await createWindow()
  buildAppMenu()
})

electron.app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') electron.app.quit()
})

electron.app.on('activate', () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) createWindow()
})

// Informa ao renderer o estado atual do 'Sempre no Topo'
electron.ipcMain.handle('get-always-on-top', async () => {
  return { enabled: mainWindow ? mainWindow.isAlwaysOnTop() : false }
})

// Informa ao renderer o estado atual da janela (fullscreen / maximized)
// Alterna o DevTools da janela principal (usado como fallback do F12
// quando nenhuma aba com webview está ativa)
electron.ipcMain.handle('toggle-main-devtools', async () => {
  if (mainWindow) {
    mainWindow.webContents.toggleDevTools()
  }
  return { success: true }
})

electron.ipcMain.handle('get-window-state', async () => {
  if (!mainWindow) return { fullscreen: false, maximized: false }
  return {
    fullscreen: mainWindow.isFullScreen(),
    maximized: mainWindow.isMaximized()
  }
})

// ===== Controles de janela via barra de títulos customizada =====
// (usados como fallback quando o Window Controls Overlay nativo
//  não está disponível — ex.: Linux)
electron.ipcMain.on('window-minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize()
})

electron.ipcMain.on('window-maximize-toggle', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow.maximize()
  }
  sendToRenderer('window-state-changed', {
    maximized: mainWindow.isMaximized(),
    fullscreen: mainWindow.isFullScreen()
  })
})

electron.ipcMain.on('window-close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close()
})

electron.ipcMain.handle('navigate', async (_event, url) => {
  if (!mainWindow) return
  const handler = BrowserModule.getIpcHandlers()['browser-navigate']
  if (handler) {
    const target = await handler(_event, url)
    if (target) {
      await mainWindow.webContents.loadURL(target)
    }
  }
})

electron.ipcMain.handle('go-back', async () => {
  if (mainWindow && mainWindow.webContents.canGoBack()) {
    await mainWindow.webContents.goBack()
  }
})

electron.ipcMain.handle('go-forward', async () => {
  if (mainWindow && mainWindow.webContents.canGoForward()) {
    await mainWindow.webContents.goForward()
  }
})

electron.ipcMain.handle('reload', async () => {
  if (mainWindow) {
    await mainWindow.webContents.reload()
  }
})

electron.ipcMain.handle('load-local-file', async (_event, filePath) => {
  if (!mainWindow) return
  const fullPath = path.join(__dirname, filePath)
  await mainWindow.webContents.loadFile(fullPath)
})

electron.ipcMain.handle('get-local-server-url', async () => {
  return localServerUrl || 'http://localhost:8080'
})

electron.ipcMain.handle('switch-module', async (_event, moduleName) => {
  AppCore.switchModule(moduleName)
})

electron.ipcMain.handle('get-modules', async () => {
  return Array.from(AppCore.modules.keys())
})

electron.ipcMain.handle('get-current-module', async () => {
  return AppCore.get('currentModule') || 'browser'
})

electron.ipcMain.handle('get-favorites', async () => {
  return favorites
})

electron.ipcMain.handle('save-session', async (_event, data) => {
  saveSessionFile({ tabs: Array.isArray(data && data.tabs) ? data.tabs : [], savedAt: new Date().toISOString() })
  return { success: true }
})

electron.ipcMain.handle('get-session', async () => readSessionFile())

electron.ipcMain.handle('get-downloads', async () => downloads)

electron.ipcMain.handle('cancel-download', async (_event, id) => {
  const item = downloadItems.get(id)
  if (!item) {
    return { success: false, error: 'Download não encontrado ou já finalizado' }
  }
  try {
    item.cancel()
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

electron.ipcMain.handle('save-favorite', async (_event, item) => {
  favorites.push(item)
  saveFavorites()
  return favorites
})

electron.ipcMain.handle('remove-favorite', async (_event, index) => {
  favorites.splice(index, 1)
  saveFavorites()
  return favorites
})

const studioHandlers = StudioModule.getIpcHandlers()
Object.entries(studioHandlers).forEach(([channel, handler]) => {
  electron.ipcMain.handle(channel, async (event, ...args) => handler(event, ...args))
})

const editorHandlers = EditorModule.getIpcHandlers()
Object.entries(editorHandlers).forEach(([channel, handler]) => {
  electron.ipcMain.handle(channel, async (event, ...args) => handler(event, ...args))
})

const projectHandlers = ProjectManager.getIpcHandlers()
Object.entries(projectHandlers).forEach(([channel, handler]) => {
  electron.ipcMain.handle(channel, async (event, ...args) => handler(event, ...args))
})

const aiHandlers = ITAAI.getIpcHandlers ? ITAAI.getIpcHandlers() : {}
Object.entries(aiHandlers).forEach(([channel, handler]) => {
  electron.ipcMain.handle(channel, async (event, ...args) => handler(event, ...args))
})

const networkHandlers = NetworkManager.getIpcHandlers ? NetworkManager.getIpcHandlers() : {}
Object.entries(networkHandlers).forEach(([channel, handler]) => {
  electron.ipcMain.handle(channel, async (event, ...args) => handler(event, ...args))
})

const buildHandlers = BuildSystem.getIpcHandlers ? BuildSystem.getIpcHandlers() : {}
Object.entries(buildHandlers).forEach(([channel, handler]) => {
  electron.ipcMain.handle(channel, async (event, ...args) => handler(event, ...args))
})

const physicsHandlers = PhysicsEngine.getIpcHandlers ? PhysicsEngine.getIpcHandlers() : {}
Object.entries(physicsHandlers).forEach(([channel, handler]) => {
  electron.ipcMain.handle(channel, async (event, ...args) => handler(event, ...args))
})

const audioHandlers = AudioSystem.getIpcHandlers ? AudioSystem.getIpcHandlers() : {}
Object.entries(audioHandlers).forEach(([channel, handler]) => {
  electron.ipcMain.handle(channel, async (event, ...args) => handler(event, ...args))
})

const scriptHandlers = ScriptEditor.getIpcHandlers ? ScriptEditor.getIpcHandlers() : {}
Object.entries(scriptHandlers).forEach(([channel, handler]) => {
  electron.ipcMain.handle(channel, async (event, ...args) => handler(event, ...args))
})

const agentHandlers = Agent.getIpcHandlers()
Object.entries(agentHandlers).forEach(([channel, handler]) => {
  electron.ipcMain.handle(channel, async (event, ...args) => handler(event, ...args))
})
