/*
=========================================================
  ITA BROWSER — MAIN PROCESS
  Navegação DIRETA na Internet. Google, YouTube,
  Instagram, GitHub, Steam e qualquer site real
  funcionam de verdade.

  UI: index.html (local)  •  Home: home.html (local)
  Tudo é carregado do app — internet 100% real.

  Portal oficial: itabrowser.top — integrado ao app via
  protocolo itabrowser://open?url=... e User-Agent ITA.
=========================================================
*/

'use strict'

const {
  app,
  BrowserWindow,
  session,
  shell,
  ipcMain,
  protocol
} = require('electron')

const path = require('path')
const fs = require('fs')
const http = require('http')

/*
=========================================================
  PORTAL OFICIAL LOCAL — itabrowser.top na nova interface
  O portal FORGE (pasta site/) é servido de dentro do app
  via itaportal:// — funciona 100%, até offline.
=========================================================
*/

const {
  registerPortalScheme,
  installPortalBridge
} = require('./src/portal/PortalBridge')

registerPortalScheme()


/*
=========================================================
  TURBO ELETRON — GPU · SCROLL · ÁUDIO · CACHE
  Flags aplicadas antes do app.ready para acelerar
  TODOS os sites (YouTube, Google, Instagram, jogos,
  WebGL, vídeo 4K, animações) no máximo de desempenho.
=========================================================
*/

app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('enable-smooth-scrolling')
app.commandLine.appendSwitch('force_high_performance_gpu')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch('disk-cache-size', '536870912')

/*
=========================================================
  CONFIGURAÇÃO
=========================================================
*/

const APP_NAME = 'ITA Browser'

/*
  Site oficial do navegador — integrado ao app via deep
  link itabrowser://open?url=... e via User-Agent ITA.
*/

const SITE_URL = 'https://itabrowser.top'

/*
  Home local: start page do navegador (cards com sites reais).
  A interface e a home vivem dentro do app — sem site remoto,
  sem proxy e sem servidor local. Internet direta.
*/

const HOME_FILE = path.join(__dirname, 'home.html')

const HOME_URL =

  'file:///' + HOME_FILE.replace(/\\/g, '/')

let mainWindow = null

/*
=========================================================
  DOWNLOADS
=========================================================
*/

const downloads = []
const downloadItems = new Map()

/*
=========================================================
  ENVIO IPC
=========================================================
*/

function sendToRenderer(channel, payload) {
  if (
    mainWindow &&
    !mainWindow.isDestroyed()
  ) {
    mainWindow.webContents.send(
      channel,
      payload
    )
  }
}

/*
=========================================================
  URL
=========================================================
*/

function isWebUrl(url) {
  return (
    typeof url === 'string' &&
    /^https?:\/\//i.test(url)
  )
}

function normalizeUrl(input) {

  let value =
    String(input || '')
      .trim()

  if (!value) {
    return null
  }

  /*
  -------------------------------------------------------
    Páginas internas
  -------------------------------------------------------
  */

  if (
    value === 'ita://home' ||
    value === 'ita://editor'
  ) {
    return value
  }

  /*
  -------------------------------------------------------
    URL completa
  -------------------------------------------------------
  */

  if (
    /^https?:\/\//i.test(value)
  ) {
    return value
  }

  /*
  -------------------------------------------------------
    localhost
  -------------------------------------------------------
  */

  if (
    /^localhost(?::\d+)?(?:\/.*)?$/i.test(value)
  ) {
    return `http://${value}`
  }

  /*
  -------------------------------------------------------
    IP local
  -------------------------------------------------------
  */

  if (
    /^(127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(?::\d+)?(?:\/.*)?$/i.test(value)
  ) {
    return `http://${value}`
  }

  /*
  -------------------------------------------------------
    Domínio
  -------------------------------------------------------
  */

  if (
    value.includes('.') &&
    !value.includes(' ')
  ) {
    return `https://${value}`
  }

  /*
  -------------------------------------------------------
    Pesquisa
  -------------------------------------------------------
  */

  return (
    'https://www.google.com/search?q=' +
    encodeURIComponent(value)
  )
}

/*
=========================================================
  SEGURANÇA BÁSICA DE URL
=========================================================
*/

const BLOCKED_URL_PATTERNS = [

  /\.(exe|bat|cmd|scr|vbs|msi|ps1)(\?|$)/i,

  /(login|signin|secure|account|update|verify|bank|banco)[^\s]*(\.xyz|\.buzz|\.click|\.gq|\.tk)/i

]

function evaluateUrlSafety(targetUrl) {

  const result = {
    url: targetUrl,
    safe: true,
    warn: false,
    reason: null,
    checkedAt:
      new Date().toISOString()
  }

  try {

    const parsed =
      new URL(targetUrl)

    if (
      parsed.protocol !== 'http:' &&
      parsed.protocol !== 'https:'
    ) {
      return result
    }

    /*
    -------------------------------------------------------
      Credenciais escondidas
      https://google.com@site-malicioso.com
    -------------------------------------------------------
    */

    if (parsed.username) {

      result.safe = false

      result.reason =
        'URL contém credenciais ocultas'

      return result
    }

    const target =
      parsed.hostname +
      parsed.pathname

    for (
      const pattern of BLOCKED_URL_PATTERNS
    ) {

      if (
        pattern.test(target)
      ) {

        result.safe = false

        result.reason =
          'URL bloqueada pelo sistema de proteção'

        return result
      }
    }

  } catch {

    result.safe = false

    result.reason =
      'URL inválida'
  }

  return result
}

/*
=========================================================
  (Servidor local removido — a navegação é sempre direta)
=========================================================
*/

/*
=========================================================
  JANELA PRINCIPAL
=========================================================
*/

function createWindow() {

  mainWindow =
    new BrowserWindow({

      width: 1400,

      height: 900,

      minWidth: 900,

      minHeight: 600,

      title:
        APP_NAME,

      backgroundColor:
        '#0a0a0c',

      /*
      -----------------------------------------------------
        Ícone
      -----------------------------------------------------
      */

      icon:
        path.join(
          __dirname,
          'public',
          'brand',
          'ita-logo.ico'
        ),

      /*
      -----------------------------------------------------
        Barra de título
      -----------------------------------------------------
      */

      titleBarStyle:
        'hidden',

      titleBarOverlay: {

        color:
          '#0a0a0c',

        symbolColor:
          '#f7f7f8',

        height:
          38
      },

      /*
      -----------------------------------------------------
        Segurança
      -----------------------------------------------------
      */

      webPreferences: {

        preload:
          path.join(
            __dirname,
            'preload.js'
          ),

        contextIsolation:
          true,

        nodeIntegration:
          false,

        sandbox:
          false,

        webviewTag:
          true,

        spellcheck:
          true,

        webSecurity:
          true,

        plugins:
          true,

        backgroundThrottling:
          false,

        autoplayPolicy:
          'no-user-gesture-required'
      }
    })

  /*
  =======================================================
    CARREGA A INTERFACE DO ITA BROWSER
  =======================================================
  */

  const indexPath =
    path.join(
      __dirname,
      'index.html'
    )

  if (
    fs.existsSync(indexPath)
  ) {

    mainWindow.loadFile(
      indexPath
    )

  } else {

    mainWindow.loadFile(
      HOME_FILE
    )
  }

  /*
  =======================================================
    DEVTOOLS
  =======================================================
  */

  mainWindow.webContents.on(
    'before-input-event',
    (_event, input) => {

      if (
        input.key === 'F12'
      ) {

        mainWindow.webContents
          .toggleDevTools()
      }
    }
  )

  /*
  =======================================================
    ERROS DA INTERFACE
  =======================================================
  */

  mainWindow.webContents.on(
    'did-fail-load',
    (
      event,
      errorCode,
      errorDescription,
      validatedURL
    ) => {

      console.error(
        'Falha ao carregar interface:',
        {
          errorCode,
          errorDescription,
          validatedURL
        }
      )
    }
  )

/*
  =======================================================
    DOWNLOADS
  =======================================================
  */

  const ses =
    mainWindow.webContents.session

  ses.on(
    'will-download',
    (
      event,
      item
    ) => {

      const id =
        `dl-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`

      const download = {

        id,

        filename:
          item.getFilename(),

        url:
          item.getURL(),

        path:
          item.getSavePath(),

        state:
          'progressing',

        received:
          0,

        total:
          item.getTotalBytes(),

        startedAt:
          new Date().toISOString()
      }

      downloads.push(
        download
      )

      downloadItems.set(
        id,
        item
      )

      item.on(
        'updated',
        (
          _event,
          state
        ) => {

          download.state =
            state === 'interrupted'
              ? 'interrupted'
              : 'progressing'

          download.received =
            item.getReceivedBytes()

          download.total =
            item.getTotalBytes()

          sendToRenderer(
            'download-progress',
            download
          )
        }
      )

      item.once(
        'done',
        (
          _event,
          state
        ) => {

          download.state =
            state

          download.finishedAt =
            new Date().toISOString()

          download.path =
            item.getSavePath()

          downloadItems.delete(
            id
          )

          sendToRenderer(
            'download-done',
            download
          )
        }
      )
    }
  )

  /*
  =======================================================
    NOVAS JANELAS / TARGET BLANK

    Não abrir Chrome/Edge.

    O renderer pode decidir criar uma nova aba.
  =======================================================
  */

  /*
  =======================================================
    SESSÃO TURBO — UA ITA · PERMISSÕES · SPELLCHECK
    - User-Agent com token ITABrowser (o site oficial
      itabrowser.top detecta o navegador sozinho).
    - Permissões liberadas (câmera, microfone, notifi-
      cações, tela, clipboard...) em TODAS as sessões
      (UI + webviews persist:ita-tabs).
    - Corretor ortográfico pt-BR/en-US.
  =======================================================
  */

  const itaUA =
    ses.getUserAgent() +
    ' ITABrowser/1.0.0 (ITA Games Studios)'

  try {
    ses.setUserAgent(itaUA)
    session.defaultSession.setUserAgent(itaUA)
    session.fromPartition('persist:ita-tabs').setUserAgent(itaUA)
  } catch { /* preview fora do Electron */ }

  try {
    ses.setSpellCheckEnabled(true)
    ses.setSpellCheckLanguages(['pt-BR', 'en-US'])
  } catch { /* opcional */ }

  const grantAllPermission = (_webContents, _permission, callback) => {
    callback(true)
  }

  const allowPermissionCheck = () => true

  ;[
    ses,
    session.fromPartition('persist:ita-tabs')
  ].forEach((targetSession) => {
    try {
      targetSession.setPermissionRequestHandler(grantAllPermission)
      targetSession.setPermissionCheckHandler(allowPermissionCheck)
    } catch { /* sessão indisponível */ }
  })

  /*
  =======================================================
    CONTROLE DE WINDOW.OPEN
  =======================================================
  */

  mainWindow.webContents.setWindowOpenHandler(
    ({ url }) => {

      if (
        isWebUrl(url)
      ) {

        /*
        ---------------------------------------------------
          Envia para o renderer.
          O renderer poderá transformar em nova aba.
        ---------------------------------------------------
        */

        sendToRenderer(
          'new-tab-request',
          {
            url
          }
        )

      }

      return {
        action:
          'deny'
      }
    }
  )

  /*
  =======================================================
    NAVEGAÇÃO
  =======================================================
  */

  mainWindow.webContents.on(
    'will-navigate',
    (
      event,
      url
    ) => {

      /*
      -----------------------------------------------------
        A interface principal não deve sair para outro site.
        Sites externos ficam nos webviews.
      -----------------------------------------------------
      */

      if (
        mainWindow &&
        url !==
          mainWindow.webContents.getURL()
      ) {

        /*
        Não bloqueamos navegação da própria interface
        quando ela for necessária.
        */

      }
    }
  )

  /*
  =======================================================
    ESTADO DA JANELA
  =======================================================
  */

  const sendWindowState = () => {

    sendToRenderer(
      'window-state-changed',
      {
        maximized:
          mainWindow.isMaximized(),

        fullscreen:
          mainWindow.isFullScreen()
      }
    )
  }

  ;[
    'maximize',
    'unmaximize',
    'enter-full-screen',
    'leave-full-screen'
  ].forEach(
    eventName => {

      mainWindow.on(
        eventName,
        sendWindowState
      )
    }
  )

  mainWindow.on(
    'closed',
    () => {

      mainWindow =
        null
    }
  )
}

/*
=========================================================
  WEBVIEWS — WINDOW.OPEN / TARGET=_BLANK → NOVA ABA
  Popups dos sites (OAuth, compartilhar, chat) abrem
  como aba ITA em vez de janela externa.
=========================================================
*/

app.on(
  'web-contents-created',
  (_event, contents) => {

    if (
      contents.getType() ===
      'webview'
    ) {

      contents.setWindowOpenHandler(
        ({ url }) => {

          if (
            isWebUrl(url)
          ) {

            sendToRenderer(
              'new-tab-request',
              { url }
            )

          } else {

            /*
              Deep link itabrowser://open?url=... aberto via
              popup → vira nova aba ITA com o site de destino.
            */

            const deepLinkUrl =
              extractDeepLinkUrl([url])

            if (deepLinkUrl) {

              sendToRenderer(
                'new-tab-request',
                { url: deepLinkUrl }
              )
            }
          }

          return {
            action:
              'deny'
          }
        }
      )

      /*
      -----------------------------------------------------
        DEEP LINKS DENTRO DAS ABAS — itabrowser://open?url=
        Clicar em um card do portal oficial dentro de uma
        aba abre o site em NOVA ABA ITA (a webview em si
        não navega para esquemas desconhecidos).
      -----------------------------------------------------
      */

      contents.on(
        'will-navigate',
        (event, url) => {

          if (
            typeof url === 'string' &&
            url.toLowerCase().startsWith(PROTOCOL + '://')
          ) {

            event.preventDefault()

            const deepLinkUrl =
              extractDeepLinkUrl([url])

            if (deepLinkUrl) {

              sendToRenderer(
                'new-tab-request',
                { url: deepLinkUrl }
              )
            }
          }
        }
      )
    }
  }
)


/*
=========================================================
  ITABROWSER:// — PORTAL OFICIAL ↔ APP (DEEP LINK)
  itabrowser.top usa links itabrowser://open?url=...
  para abrir sites direto no navegador desktop.
  Ex.: itabrowser://open?url=https%3A%2F%2Fyoutube.com
=========================================================
*/

const PROTOCOL = 'itabrowser'

function extractDeepLinkUrl(argv) {

  const arg =
    (argv || []).find(
      candidate =>
        typeof candidate === 'string' &&
        candidate.toLowerCase().startsWith(
          PROTOCOL + '://'
        )
    )

  if (!arg) {
    return null
  }

  try {

    const parsed =
      new URL(arg)

    const queryUrl =
      parsed.searchParams.get('url')

    if (
      isWebUrl(queryUrl)
    ) {
      return queryUrl
    }

    const rest =
      arg.slice((PROTOCOL + '://').length)

    const pathMatch =
      rest.match(/^open\/(https?:\/\/.+)$/i)

    if (pathMatch) {
      return pathMatch[1]
    }
  } catch {
    return null
  }

  return null
}

const gotSingleInstanceLock =
  app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {

  app.quit()

} else {

  app.on(
    'second-instance',
    (_event, argv) => {

      if (mainWindow) {

        if (mainWindow.isMinimized()) {
          mainWindow.restore()
        }

        mainWindow.focus()
      }

      const deepLinkUrl =
        extractDeepLinkUrl(argv)

      if (deepLinkUrl) {
        sendToRenderer(
          'new-tab-request',
          { url: deepLinkUrl }
        )
      }
    }
  )
}

app.setAsDefaultProtocolClient(PROTOCOL)

app.on(
  'open-url',
  (event, url) => {

    event.preventDefault()

    const target =
      extractDeepLinkUrl([url])

    if (target) {
      sendToRenderer(
        'new-tab-request',
        { url: target }
      )
    }
  }
)

/*
=========================================================
  APP READY
=========================================================
*/

app.whenReady()
  .then(
    async () => {

      /*
      -----------------------------------------------------
        Identidade do app no Windows (notificações, barra)
      -----------------------------------------------------
      */

      app.setAppUserModelId('top.itabrowser.app')

      /*
      -----------------------------------------------------
        PORTAL OFICIAL — itabrowser.top dentro do app
        Instala itaportal:// + redirect https→portal local
        nas duas sessões (interface e abas/webviews).
      -----------------------------------------------------
      */

      const portalInstalled =
        installPortalBridge(session.defaultSession)

      installPortalBridge(
        session.fromPartition('persist:ita-tabs')
      )

      console.log(
        'Portal itabrowser.top local:',
        portalInstalled ? 'ATIVADO (itaportal://)' : 'usando domínio remoto'
      )

      createWindow()


      /*
      -----------------------------------------------------
        macOS
      -----------------------------------------------------
      */

      app.on(
        'activate',
        () => {

          if (
            BrowserWindow.getAllWindows()
              .length === 0
          ) {

            createWindow()
          }
        }
      )
    }
  )

/*
=========================================================
  FECHAR APP
=========================================================
*/

app.on(
  'window-all-closed',
  () => {

    if (
      process.platform !==
      'darwin'
    ) {

      app.quit()
    }
  }
)

/*
=========================================================
  IPC — NAVEGAR
=========================================================
*/

ipcMain.handle(
  'browser-normalize-url',
  async (
    _event,
    value
  ) => {

    return normalizeUrl(
      value
    )
  }
)

/*
=========================================================
  IPC — VERIFICAR URL
=========================================================
*/

ipcMain.handle(
  'browser-check-url',
  async (
    _event,
    url
  ) => {

    return evaluateUrlSafety(
      url
    )
  }
)

/*
=========================================================
  IPC — HOME
=========================================================
*/

ipcMain.handle(
  'browser-home-url',
  async () => {

    return HOME_URL
  }
)

/*
=========================================================
  IPC — ABRIR URL EXTERNA
=========================================================

  Usar SOMENTE quando o usuário realmente escolher
  "Abrir no navegador do sistema".

=========================================================
*/

ipcMain.handle(
  'open-external',
  async (
    _event,
    url
  ) => {

    if (
      !isWebUrl(url)
    ) {

      return {
        success: false,
        error:
          'URL inválida'
      }
    }

    try {

      await shell.openExternal(
        url
      )

      return {
        success: true
      }

    } catch (error) {

      return {
        success: false,
        error:
          error.message
      }
    }
  }
)

/*
=========================================================
  IPC — VOLTAR
=========================================================
*/

ipcMain.handle(
  'go-back',
  async () => {

    if (
      !mainWindow
    ) {
      return false
    }

    if (
      mainWindow.webContents
        .canGoBack()
    ) {

      mainWindow.webContents
        .goBack()

      return true
    }

    return false
  }
)

/*
=========================================================
  IPC — AVANÇAR
=========================================================
*/

ipcMain.handle(
  'go-forward',
  async () => {

    if (
      !mainWindow
    ) {
      return false
    }

    if (
      mainWindow.webContents
        .canGoForward()
    ) {

      mainWindow.webContents
        .goForward()

      return true
    }

    return false
  }
)

/*
=========================================================
  IPC — RECARREGAR
=========================================================
*/

ipcMain.handle(
  'reload',
  async () => {

    if (
      mainWindow
    ) {

      mainWindow.webContents
        .reload()

      return true
    }

    return false
  }
)

/*
=========================================================
  IPC — MINIMIZAR
=========================================================
*/

ipcMain.on(
  'window-minimize',
  () => {

    if (
      mainWindow &&
      !mainWindow.isDestroyed()
    ) {

      mainWindow.minimize()
    }
  }
)

/*
=========================================================
  IPC — MAXIMIZAR
=========================================================
*/

ipcMain.on(
  'window-maximize-toggle',
  () => {

    if (
      !mainWindow ||
      mainWindow.isDestroyed()
    ) {
      return
    }

    if (
      mainWindow.isMaximized()
    ) {

      mainWindow.unmaximize()

    } else {

      mainWindow.maximize()
    }

    sendToRenderer(
      'window-state-changed',
      {
        maximized:
          mainWindow.isMaximized(),

        fullscreen:
          mainWindow.isFullScreen()
      }
    )
  }
)

/*
=========================================================
  IPC — FECHAR
=========================================================
*/

ipcMain.on(
  'window-close',
  () => {

    if (
      mainWindow &&
      !mainWindow.isDestroyed()
    ) {

      mainWindow.close()
    }
  }
)

/*
=========================================================
  IPC — DOWNLOAD CANCEL
=========================================================
*/

ipcMain.handle(
  'cancel-download',
  async (
    _event,
    downloadId
  ) => {

    const item =
      downloadItems.get(
        downloadId
      )

    if (!item) {

      return {
        success: false
      }
    }

    try {

      item.cancel()

      return {
        success: true
      }

    } catch {

      return {
        success: false
      }
    }
  }
)

/*
=========================================================
  IPC — LISTAR DOWNLOADS
=========================================================
*/

ipcMain.handle(
  'get-downloads',
  async () => {

    return downloads
  }
)

/*
=========================================================
  IPC — DEVTOOLS
=========================================================
*/

ipcMain.handle(
  'toggle-main-devtools',
  async () => {

    if (
      !mainWindow
    ) {
      return false
    }

    mainWindow.webContents
      .toggleDevTools()

    return true
  }
)

/*
=========================================================
  SEGURANÇA DE CERTIFICADOS

  Não ignorar certificados SSL globalmente.
=========================================================
*/

app.on(
  'certificate-error',
  (
    event,
    webContents,
    url,
    error,
    certificate,
    callback
  ) => {

    /*
    -----------------------------------------------------
      Só permitir certificados válidos.
    -----------------------------------------------------
    */

    event.preventDefault()

    callback(false)
  }
)

/*
=========================================================
  LOG
=========================================================
*/

console.log(
  '========================================='
)

console.log(
  'ITA Browser iniciado'
)

console.log(
  'Home:',
  HOME_URL
)

console.log(
  'Internet direta:',
  'ATIVADA'
)

console.log(
  'Internet:',
  '100% DIRETA (google.com, youtube.com e toda a web)'
)

console.log(
  '========================================='
)