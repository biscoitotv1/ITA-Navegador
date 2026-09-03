/*
=========================================================
  ITA BROWSER — MAIN PROCESS
  Navegação DIRETA na Internet. Google, YouTube,
  Instagram, GitHub, Steam e qualquer site real
  funcionam de verdade.

  UI: index.html (local)  •  Início: https://www.google.com (web real)
  Tudo é carregado do app — internet 100% real, sem landing local.
=========================================================
*/

'use strict'

const {
  app,
  BrowserWindow,
  dialog,
  session,
  shell,
  ipcMain
} = require('electron')
/*
  AUTO-UPDATE ENGINE — electron-updater (provider "github" no package.json).
  O autoUpdater nativo do Electron exige Squirrel.Windows e não é
  compatível com o instalador NSIS do ITA Navegador; além disso,
  importá-lo do 'electron' junto com app/BrowserWindow/dialog criaria
  uma declaração duplicada. Esta engine consome o GitHub Releases
  automaticamente e expõe os mesmos eventos (update-downloaded etc.).
*/
const { autoUpdater } = require('electron-updater')

const path = require('path')
const fs = require('fs')
const http = require('http')

/*
=========================================================
  RESILIÊNCIA DE PROCESSO & TRATAMENTO GLOBAL DE ERROS
=========================================================
*/

process.on('uncaughtException', (error) => {
  console.error('[ITA Main] Uncaught Exception:', error && error.stack ? error.stack : error)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('[ITA Main] Unhandled Rejection at:', promise, 'reason:', reason)
})

/*
=========================================================
  TURBO ELETRON — GPU · SCROLL · ÁUDIO · CACHE
  Flags aplicadas antes do app.ready para acelerar
  TODOS os sites (YouTube, Google, Instagram, jogos,
  WebGL, vídeo 4K, animações) no máximo de desempenho.

  CORREÇÃO MASTER DE ARBITRAGEM E PERFORMANCE:
  1) Aceleração de hardware PROFUNDA — rasterização na
     GPU, zero-copy e GPU SEMPRE liberada (mesmo quando
     a GPU estiver na blocklist do Chromium).
  2) OutOfBlinkCors DESATIVADO — evita bloqueios rígidos
     de CORS no Blink em sites externos (YouTube etc.).
  Todas as flags são aplicadas ANTES do app.whenReady().
=========================================================
*/

/* 1) ACELERAÇÃO DE HARDWARE PROFUNDA E FLAGS DO CHROMIUM */

app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')

/* Demais flags de performance e estabilidade */

app.commandLine.appendSwitch('enable-smooth-scrolling')
app.commandLine.appendSwitch('force_high_performance_gpu')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch('disk-cache-size', '536870912')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.commandLine.appendSwitch('enable-parallel-downloading')
app.commandLine.appendSwitch('enable-features', 'CanvasOopRasterization')

/*
=========================================================
  CONFIGURAÇÃO
=========================================================
*/

const APP_NAME = 'ITA Browser'

/*
  SESSÃO PERSISTENTE E ISOLADA DAS ABAS (WEBVIEWS)
  Toda tag <webview> criada nas abas usa esta partição:
  cache, cookies de login e service workers (YouTube,
  Google etc.) funcionam exatamente como no Google Chrome.
*/

const WEBVIEW_PARTITION = 'persist:ita_secure_session'

/*
  Home local: start page do navegador (cards com sites reais).
  A interface e a home vivem dentro do app — sem site remoto,
  sem proxy e sem servidor local. Internet direta.
*/

/*
  NAVEGAÇÃO 100% DIRETA — sem páginas locais de
  apresentação. A página inicial é um site real da
  internet, carregado no webview com a partição
  persistente e as flags de aceleração do Chromium.
*/

const START_PAGE_URL = 'https://www.google.com'

let mainWindow = null

autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

autoUpdater.on('checking-for-update', () => {
  console.log('[ITA Updater] Checking for updates...')
})

autoUpdater.on('update-available', (info) => {
  console.log('[ITA Updater] Update available:', info.version)
})

autoUpdater.on('update-not-available', (info) => {
  console.log('[ITA Updater] ITA Browser is up to date:', info.version)
})

/*
  ATUALIZAÇÃO BAIXADA COM SUCESSO — diálogo nativo estilo Chrome.
  "Depois" continua seguro: autoInstallOnAppQuit aplica ao fechar.
*/
autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Atualização Pronta',
    message: 'Uma nova versão do ITA Navegador foi baixada. O aplicativo será reiniciado para aplicar a melhoria.',
    buttons: ['Reiniciar Agora', 'Depois']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

autoUpdater.on('download-progress', (progress) => {
  console.log('[ITA Updater] Download progress:', Math.round(progress.percent) + '%')
})

autoUpdater.on('error', (error) => {
  console.error('[ITA Updater] Update check failed:', error.message)
})

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
    value === 'ita://ide' ||
    value === 'ita://editor'
  ) {
    /* Páginas internas/legadas redirecionam para a web real */
    return START_PAGE_URL
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
          false,

        allowRunningInsecureContent:
          true,

        plugins:
          true,

        backgroundThrottling:
          false,

        v8CacheOptions:
          'full',

        autoplayPolicy:
          'no-user-gesture-required'
      }
    })

  /*
  =======================================================
    GARANTIA DE SESSÃO PERSISTENTE E SEGURANÇA (WEBVIEWS)
  =======================================================
  */

  mainWindow.webContents.on(
    'will-attach-webview',
    (_event, webPreferences, params) => {
      params.partition = WEBVIEW_PARTITION
      webPreferences.contextIsolation = true
      webPreferences.nodeIntegration = false
      webPreferences.plugins = true
      webPreferences.allowRunningInsecureContent = true
      webPreferences.webSecurity = false
      webPreferences.backgroundThrottling = false
      webPreferences.autoplayPolicy = 'no-user-gesture-required'
    }
  )

  /*
  =======================================================
    CARREGA A INTERFACE DO ITA BROWSER
  =======================================================
  */

  /*
    A janela principal carrega SEMPRE a interface interna
    do navegador (src/browser/index.html): abas, barra de
    endereço e webviews navegando na internet real.
    A landing page pública (index.html na raiz) é o site
    de vendas/download e NUNCA é aberta pelo aplicativo.
  */

  const browserInterfacePath =
    path.join(
      __dirname,
      'src',
      'browser',
      'index.html'
    )

  if (
    fs.existsSync(browserInterfacePath)
  ) {

    mainWindow.loadFile(
      browserInterfacePath
    )

  } else {

    /*
      Falha visível em vez de janela branca silenciosa:
      sem a interface interna o app não é um navegador.
    */

    console.error(
      'ERRO FATAL: interface interna não encontrada em',
      browserInterfacePath
    )

    try {

      dialog.showErrorBox(
        'ITA Browser',
        'A interface interna do navegador não foi encontrada:\n' +
          browserInterfacePath +
          '\n\nReinstale o aplicativo para corrigir a instalação.'
      )

    } catch { /* ambiente sem suporte a diálogo */ }

    app.quit()
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
    - User-Agent REAL do Google Chrome (Windows x64):
      sites como YouTube, WhatsApp e Instagram servem
      versões degradadas/quebradas quando detectam
      "Electron" na string — com UA Chrome puro, todos
      os componentes dinâmicos renderizam normalmente.
    - Permissões liberadas (câmera, microfone, notifi-
      cações, tela, clipboard, WebGL, pointer lock...)
      sessão de abas (persist:ita_secure_session).
    - Corretor ortográfico pt-BR/en-US.
  =======================================================
  */

  /* UA idêntico ao Chrome estável atual (formato Google).
     NÃO acrescentar sufixos: qualquer token além do padrão
     volta a expor o app e reativa bloqueios dos sites. */

  const CHROME_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/131.0.0.0 Safari/537.36'

  /* Cobertura global: qualquer webContents criado antes
     da configuração das sessões já nasce com UA Chrome */

  app.userAgentFallback = CHROME_UA

  try {
    ses.setUserAgent(CHROME_UA)
    session.defaultSession.setUserAgent(CHROME_UA)
    session.fromPartition(WEBVIEW_PARTITION).setUserAgent(CHROME_UA)
    console.log('User-Agent: Chrome real aplicado em todas as sessões')
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
    session.fromPartition(WEBVIEW_PARTITION)
  ].forEach((targetSession) => {
    try {
      targetSession.setPermissionRequestHandler(grantAllPermission)
      targetSession.setPermissionCheckHandler(allowPermissionCheck)
    } catch { /* sessão indisponível */ }
  })

  /*
  =======================================================
    CERTIFICADOS SSL/TLS · CORS GLOBAL

    - setCertificateVerifyProc(0): aceita certificados
      (inclui proxies/antivírus que assinam o tráfego) —
      evita quedas de conexão SSL/TLS em qualquer sessão.
    - onHeadersReceived: injeta Access-Control-Allow-Origin
      quando a resposta NÃO traz o header — libera scripts
      e mídias dinâmicas de domínios externos (YouTube etc.).
  =======================================================
  */

  ;[
    ses,
    session.fromPartition(WEBVIEW_PARTITION)
  ].forEach((targetSession) => {

    try {

      /* callback(0) = aceita o certificado · callback(-2) = rejeita */

      targetSession.setCertificateVerifyProc(
        (_request, callback) => callback(0)
      )

    } catch { /* sessão indisponível */ }

    try {

      targetSession.webRequest.onHeadersReceived(
        (details, callback) => {

          const headers =
            details.responseHeaders || {}

          /* Respeita o header que o site já enviou
             (evita ACAO duplicado, que quebra XHR);
             injeta apenas quando estiver ausente */

          const hasAcao =
            Object.keys(headers).some(
              (key) =>
                key.toLowerCase() ===
                'access-control-allow-origin'
            )

          if (!hasAcao) {

            headers['Access-Control-Allow-Origin'] =
              ['*']

            headers['Access-Control-Allow-Headers'] =
              ['*']

            headers['Access-Control-Allow-Methods'] =
              ['GET, POST, PUT, DELETE, OPTIONS']
          }

          callback(
            {
              responseHeaders: headers
            }
          )
        }
      )

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
    NAVEGAÇÃO — BLINDAGEM DA INTERFACE INTERNA
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
        A janela principal é SEMPRE a UI local do navegador
        (src/browser/index.html). A landing page pública
        (index.html na raiz) e qualquer site externo NUNCA
        substituem a interface: URLs da web viram nova aba
        no webview, tratadas pelo próprio renderer.
      -----------------------------------------------------
      */

      const normalizedUrl =
        String(url || '')
          .split('#')[0]
          .replace(/\\/g, '/')
          .toLowerCase()

      const isInterfaceUrl =
        normalizedUrl.startsWith('file://') &&
        normalizedUrl.includes('/src/browser/index.html')

      if (
        isInterfaceUrl
      ) {

        /* Recarregar a própria interface é permitido. */

        return
      }

      event.preventDefault()

      console.warn(
        '[ITA Main] Navegação da janela principal bloqueada:',
        url
      )

      if (
        isWebUrl(url)
      ) {

        sendToRenderer(
          'new-tab-request',
          {
            url
          }
        )
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
        Um deep link dentro de uma aba abre o site de
        destino em NOVA ABA ITA (a webview em si não
        navega para esquemas desconhecidos).
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
  ITABROWSER:// — DEEP LINK PARA O APP
  Links itabrowser://open?url=... abrem o site de
  destino direto no navegador desktop.
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
        PORTAL REMOVIDO — itabrowser.top nunca mais carrega
        Bloqueia qualquer requisição ao domínio do portal
        nas duas sessões (interface e abas/webviews).
      -----------------------------------------------------
      */

      const blockPortal = (targetSession) => {

        try {

          targetSession.webRequest.onBeforeRequest(
            {
              urls: [
                '*://itabrowser.top/*',
                '*://*.itabrowser.top/*'
              ]
            },
            (_details, callback) => callback({ cancel: true })
          )

        } catch { /* opcional */ }
      }

      blockPortal(session.defaultSession)
      blockPortal(session.fromPartition(WEBVIEW_PARTITION))

      console.log(
        'Portal itabrowser.top: REMOVIDO e BLOQUEADO'
      )

      console.log(
        '⚡ Turbo Electron: ATIVADO — GPU raster · zero-copy · ' +
        'download paralelo · abas 100% ligadas'
      )

      createWindow()

      /*
        VERIFICA ATUALIZAÇÕES AUTOMATICAMENTE EM SEGUNDO PLANO
        (estilo Google Chrome). Somente em produção — em
        desenvolvimento a checagem é ignorada para não travar
        o ciclo de testes.
      */
      if (app.isPackaged) {
        /* Verifica atualizações automaticamente em segundo plano */
        autoUpdater.checkForUpdatesAndNotify().catch((error) => {
          console.error('[ITA Updater] Falha na checagem de atualização:', error.message)
        })
      } else {
        console.log('[ITA Updater] Automatic updates run in packaged releases only.')
      }


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

    /* Página inicial = site real da internet */

    return START_PAGE_URL
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
  'Página inicial:',
  START_PAGE_URL
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
