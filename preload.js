/*
=========================================================
  ITA BROWSER — PRELOAD
  Ponte segura (contextIsolation) entre a interface e o
  main process. Mapeia os nomes usados pela UI para os
  canais do main.js. Recursos sem canal no main recebem
  fallback local — a interface nunca quebra.
=========================================================
*/

'use strict'

const { contextBridge, ipcRenderer } = require('electron')

/* ---------- utilidades internas ---------- */

/*
  Estado da janela: cacheado no preload a partir do canal
  'window-state-changed' — getWindowState responde na hora,
  sem canal dedicado no main.
*/
const windowState = { maximized: false, fullscreen: false }
const windowStateHandlers = new Set()

ipcRenderer.on('window-state-changed', (_e, s) => {
  if (s && typeof s === 'object') {
    windowState.maximized = !!s.maximized
    windowState.fullscreen = !!s.fullscreen
  }
  windowStateHandlers.forEach((cb) => { try { cb(windowState) } catch { /* handler da UI */ } })
})

function listen(channel, cb) {
  const handler = (_e, payload) => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

/*
  Downloads: o main emite apenas progress/done. O primeiro
  progress de um id é repassado também aos handlers de
  "started", mantendo a UI de downloads funcionando.
*/
const downloadSeen = new Set()
const startedHandlers = new Set()
const progressHandlers = new Set()

ipcRenderer.on('download-progress', (_e, d) => {
  if (d && d.id && !downloadSeen.has(d.id)) {
    downloadSeen.add(d.id)
    startedHandlers.forEach((cb) => { try { cb(d) } catch { /* handler da UI */ } })
  }
  progressHandlers.forEach((cb) => { try { cb(d) } catch { /* handler da UI */ } })
})

/*
  Sessão: persistida localmente (localStorage da UI).
  Se existir sessão salva, o evento restore-session é
  emitido uma vez, replicando o comportamento anterior.
*/
const SESSION_KEY = 'ita-session'
const restoreHandlers = new Set()
let restoreScheduled = false

function readSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function scheduleRestoreSession() {
  if (restoreScheduled) return
  const session = readSession()
  if (!session) return
  restoreScheduled = true
  setTimeout(() => {
    restoreHandlers.forEach((cb) => { try { cb(session) } catch { /* handler da UI */ } })
  }, 300)
}

/* Recursos antigos sem canal no main: no-op silencioso. */
function legacyNoop(name, fallback) {
  let warned = false
  return () => {
    if (!warned) {
      warned = true
      console.debug('[ITA Browser] recurso indisponível nesta versão:', name)
    }
    return Promise.resolve(fallback)
  }
}

/* ---------- ponte principal usada pela interface ---------- */

contextBridge.exposeInMainWorld('itaBrowserAPI', {
  // URLs e navegação
  normalizeUrl: (value) => ipcRenderer.invoke('browser-normalize-url', value),
  checkUrl: (url) => ipcRenderer.invoke('browser-check-url', url),
  getHomeUrl: () => ipcRenderer.invoke('browser-home-url'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  goBack: () => ipcRenderer.invoke('go-back'),
  goForward: () => ipcRenderer.invoke('go-forward'),
  reload: () => ipcRenderer.invoke('reload'),

  // Downloads
  getDownloads: () => ipcRenderer.invoke('get-downloads'),
  cancelDownload: (id) => ipcRenderer.invoke('cancel-download', id),
  onDownloadStarted: (cb) => {
    startedHandlers.add(cb)
    return () => startedHandlers.delete(cb)
  },
  onDownloadProgress: (cb) => {
    progressHandlers.add(cb)
    return () => progressHandlers.delete(cb)
  },
  onDownloadDone: (cb) => listen('download-done', cb),

  // Janela
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  toggleMaximizeWindow: () => ipcRenderer.send('window-maximize-toggle'),
  closeWindow: () => ipcRenderer.send('window-close'),
  toggleMainDevTools: () => ipcRenderer.invoke('toggle-main-devtools'),
  getWindowState: () => Promise.resolve({ ...windowState }),
  onWindowState: (cb) => {
    windowStateHandlers.add(cb)
    return () => windowStateHandlers.delete(cb)
  },
  // Alias legado: mesma corrente de eventos de estado da janela
  onWindowModeChanged: (cb) => {
    windowStateHandlers.add(cb)
    return () => windowStateHandlers.delete(cb)
  },

  // window.open / target="_blank": o main nega e avisa; a UI cria a aba
  onNewTabRequest: (cb) => listen('new-tab-request', cb),

  // Sessão (persistida no localStorage da UI + evento de restore)
  saveSession: (data) => {
    try {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(data || null))
      return Promise.resolve(true)
    } catch {
      return Promise.resolve(false)
    }
  },
  getSession: () => Promise.resolve(readSession()),
  onRestoreSession: (cb) => {
    restoreHandlers.add(cb)
    scheduleRestoreSession()
    return () => restoreHandlers.delete(cb)
  },

  // Legado sem canal no main atual: assinatura válida, nunca dispara
  onTabReload: (cb) => { void cb; return () => {} },
  onTabDevTools: (cb) => { void cb; return () => {} },
  onSecurityBlock: (cb) => { void cb; return () => {} },
  onSecurityWarning: (cb) => { void cb; return () => {} }
})

/*
  Ponte antiga window.itaBrowser — a interface a enriquece com
  itaUiApi (Object.assign) quando ela existe; expomos o mínimo.
*/
contextBridge.exposeInMainWorld('itaBrowser', {
  isElectron: true,
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
})
