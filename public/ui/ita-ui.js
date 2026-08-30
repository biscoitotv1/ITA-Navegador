/* =========================================================
   ITA NAVEGADOR — Controlador da interface principal
   ---------------------------------------------------------
   Integração:
   • src/server/LocalServer.js  → proxy de navegação (/proxy?url=)
   • preload.js (window.itaBrowserAPI) → janela, downloads,
     segurança e sessão via IPC
   • window.itaBrowser → favoritos + URL do servidor local
   ========================================================= */

(() => {
  'use strict'

  const API = window.itaBrowserAPI || null // IPC do Electron (opcional)
  const BR = window.itaBrowser || null // favoritos + servidor local
  const SEARCH_URL = 'https://www.google.com/search?q='
  const PROXY_PATH = '/proxy?url='
  const els = {}

  // ---------- Estado global ----------
  const tabs = new Map() // id -> objeto da aba
  let tabOrder = [] // ids em ordem de criação
  let activeId = null
  let seq = 0
  let serverBase = null // ex.: http://localhost:8080
  let saveTimer = null
  let toastTimer = null

  const el = (id) => els[id] || (els[id] = document.getElementById(id))

  // =========================================================
  // HELPERS
  // =========================================================

  function nowIso() {
    return new Date().toISOString()
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '—'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let i = 0
    let v = bytes
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024
      i++
    }
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
  }

  function displayHost(u) {
    try {
      return new URL(u).hostname
    } catch {
      return ''
    }
  }

  /** Descarta o empacotamento do proxy local e devolve a URL real. */
  function unwrapProxyUrl(u) {
    if (typeof u !== 'string' || !u) return u
    try {
      const parsed = new URL(u, serverBase || location.origin)
      if (parsed.pathname === '/proxy') {
        const target = parsed.searchParams.get('url')
        if (target) return target
      }
      const match = parsed.pathname.match(/\/proxy\/(.+)$/)
      if (match) return decodeURIComponent(match[1])
    } catch {
      // mantém a URL original
    }
    return u
  }

  /** Empacota uma URL real no proxy do servidor local. */
  function getProxyUrl(realUrl) {
    const base = serverBase || location.origin
    return `${base}${PROXY_PATH}${encodeURIComponent(realUrl)}`
  }

  /** URLs internas (ex.: /ide) carregam na mesma origem, sem proxy. */
  function resolveViewSrc(u) {
    if (typeof u === 'string' && u.startsWith('/') && !u.startsWith('//')) {
      return location.origin + u
    }
    return getProxyUrl(u)
  }

  function looksLikeHost(input) {
    if (/^localhost(:\d+)?([/?#]|$)/i.test(input)) return true
    if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?([/?#]|$)/.test(input)) return true
    return /^[a-z\d-]+(\.[a-z\d-]+)+(:\d+)?([/?#].*)?$/i.test(input)
  }

  /** Converte o que o usuário digitou em URL navegável (ou busca). */
  function normalizeInput(raw) {
    const input = String(raw || '').trim()
    if (!input) return null
    if (/^(https?|file):\/\//i.test(input)) return input
    if (/^(about|data|view-source):/i.test(input)) return input
    if (looksLikeHost(input)) return `https://${input}`
    return SEARCH_URL + encodeURIComponent(input)
  }

  function activeTab() {
    return tabs.get(activeId) || null
  }

  // =========================================================
  // ABAS — DOM, criação, ativação e fechamento
  // =========================================================

  function createTabObject(url) {
    return {
      id: `tab-${++seq}`,
      title: 'Nova aba',
      url: url || null, // URL real (fora do proxy)
      history: [],
      histIndex: -1,
      loading: false,
      favicon: null,
      el: null,
      titleEl: null,
      faviconEl: null,
      webview: null
    }
  }

  function letterFor(title) {
    const text = String(title || '').trim()
    const ch = [...text][0]
    return ch && /[\wÀ-ÿ]/.test(ch) ? ch.toUpperCase() : 'N'
  }

  function buildTabDom(tab) {
    const node = document.createElement('button')
    node.type = 'button'
    node.className = 'tab'
    node.id = tab.id
    node.setAttribute('role', 'tab')
    node.title = tab.title || 'Nova aba'

    const fav = document.createElement('span')
    fav.className = 'tab-favicon letter'
    fav.textContent = letterFor(tab.title)

    const title = document.createElement('span')
    title.className = 'tab-title'
    title.textContent = tab.title

    const close = document.createElement('span')
    close.className = 'tab-close'
    close.title = 'Fechar aba'
    close.setAttribute('role', 'button')
    close.setAttribute('aria-label', `Fechar aba ${tab.title}`)
    close.innerHTML =
      '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'

    node.append(fav, title, close)
    node.addEventListener('click', (ev) => {
      if (!close.contains(ev.target)) activateTab(tab.id)
    })
    close.addEventListener('click', () => closeTab(tab.id))

    el('tabsScroll').appendChild(node)
    tab.el = node
    tab.titleEl = title
    tab.faviconEl = fav
  }

  function renderTabMeta(tab) {
    if (!tab.titleEl) return
    tab.titleEl.textContent = tab.title || 'Nova aba'
    tab.el.title = tab.url ? `${tab.title}\n${tab.url}` : 'Nova aba'
    tab.faviconEl.classList.toggle('letter', !tab.favicon)
    if (tab.favicon) {
      tab.faviconEl.textContent = ''
      tab.faviconEl.style.backgroundImage = `url("${tab.favicon}")`
      tab.faviconEl.style.backgroundSize = 'cover'
      tab.faviconEl.style.backgroundPosition = 'center'
    } else {
      tab.faviconEl.textContent = letterFor(tab.title)
      tab.faviconEl.style.backgroundImage = ''
    }
  }

  function isElectron() {
    return !!(window.itaAPI || window.itaBrowser || window.electronAPI)
  }

  function ensureWebView(tab) {
    if (tab.webview) return tab.webview
    // Fora do Electron (site estático): usa iframe para pré-visualização real
    const wv = document.createElement(isElectron() ? 'webview' : 'iframe')
    wv.className = 'webview'
    if (isElectron()) {
      wv.setAttribute('partition', 'persist:ita')
      wv.setAttribute('allowpopups', '')
    } else {
      wv.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups')
      wv.setAttribute('referrerpolicy', 'no-referrer')
    }
    el('viewport').appendChild(wv)
    tab.webview = wv
    wireWebView(tab)
    return wv
  }

  function createTab(url, opts = {}) {
    const tab = createTabObject(url)
    tabs.set(tab.id, tab)
    tabOrder.push(tab.id)
    buildTabDom(tab)
    if (url) {
      navigateTab(tab, url)
    } else {
      renderTabMeta(tab)
    }
    if (opts.activate !== false) activateTab(tab.id)
    scheduleSessionSave()
    return tab
  }

  function closeTab(id) {
    const tab = tabs.get(id)
    if (!tab) return
    const idx = tabOrder.indexOf(id)
    if (tab.webview) {
      try {
        tab.webview.remove()
      } catch {
        // webview já removida
      }
    }
    tab.el.remove()
    tabs.delete(id)
    tabOrder.splice(idx, 1)

    if (tabOrder.length === 0) {
      // nunca deixamos o navegador sem nenhuma aba
      createTab(null)
      return
    }
    if (activeId === id) {
      activateTab(tabOrder[Math.min(idx, tabOrder.length - 1)])
    }
    scheduleSessionSave()
  }

  function activateTab(id) {
    if (!tabs.has(id)) return
    activeId = id
    for (const [tid, tab] of tabs) {
      tab.el.classList.toggle('active', tid === id)
    }
    const tab = activeTab()
    el('newTabPage').classList.toggle('hidden', !!tab.url)
    syncActiveView()
    updateOmni()
    updateNavButtons()
    scheduleSessionSave()
  }

  function syncActiveView() {
    for (const [, tab] of tabs) {
      if (tab.webview) {
        tab.webview.classList.toggle('visible', tab.id === activeId && !!tab.url)
      }
    }
  }

  // =========================================================
  // NAVEGAÇÃO — proxy interno + histórico por aba
  // =========================================================

  function pushHistory(tab, realUrl) {
    const current = tab.history[tab.histIndex]
    if ((current || null) === (realUrl || null)) return
    tab.history = tab.history.slice(0, tab.histIndex + 1)
    tab.history.push(realUrl || null)
    tab.histIndex = tab.history.length - 1
  }

  /** Sincroniza o histórico quando a navegação partiu da própria página. */
  function syncHistoryOnNavigate(tab, realUrl) {
    const current = tab.history[tab.histIndex]
    if ((current || null) === (realUrl || null)) return
    pushHistory(tab, realUrl)
    updateNavButtons()
  }

  function navigateTab(tab, realUrl, opts = {}) {
    if (!tab) return
    const push = opts.pushHistory !== false
    tab.url = realUrl || null

    if (!tab.url) {
      // volta para a página de nova aba
      if (tab.webview) tab.webview.classList.remove('visible')
      el('newTabPage').classList.remove('hidden')
      tab.title = 'Nova aba'
      tab.favicon = null
      renderTabMeta(tab)
      if (push) pushHistory(tab, null)
      syncActiveView()
      updateOmni()
      updateNavButtons()
      scheduleSessionSave()
      return
    }

    el('newTabPage').classList.add('hidden')
    if (push) pushHistory(tab, tab.url)
    const wv = ensureWebView(tab)
    wv.setAttribute('src', resolveViewSrc(tab.url))
    syncActiveView()
    updateOmni()
    updateNavButtons()
    scheduleSessionSave()
  }

  function navigateToHistoryEntry(tab) {
    const url = tab.history[tab.histIndex] || null
    navigateTab(tab, url, { pushHistory: false })
  }

  function goBack() {
    const tab = activeTab()
    if (!tab || tab.histIndex <= 0) return
    tab.histIndex--
    navigateToHistoryEntry(tab)
  }

  function goForward() {
    const tab = activeTab()
    if (!tab || tab.histIndex >= tab.history.length - 1) return
    tab.histIndex++
    navigateToHistoryEntry(tab)
  }

  function reload() {
    const tab = activeTab()
    if (!tab) return
    if (!tab.url) {
      navigateTab(tab, null, { pushHistory: false })
      return
    }
    const wv = tab.webview || ensureWebView(tab)
    try {
      wv.reload()
    } catch {
      wv.setAttribute('src', resolveViewSrc(tab.url))
    }
  }

  function goHome() {
    const tab = activeTab()
    if (tab) navigateTab(tab, null)
  }

  function submitOmni(raw) {
    const tab = activeTab()
    if (!tab) return
    const url = normalizeInput(raw)
    if (!url) return
    navigateTab(tab, url)
    el('urlInput').blur()
  }

  // =========================================================
  // OMNIBOX — campo de endereço limpo + indicador de segurança
  // =========================================================

  function updateOmni() {
    const tab = activeTab()
    if (!tab) return
    const input = el('urlInput')
    if (document.activeElement === input) return // não interrompe a digitação
    input.value = tab.url || ''
    applyLockState(tab.url)
    updateStarState()
  }

  function applyLockState(url) {
    const lock = el('omniLock')
    lock.classList.remove('http', 'internal')
    if (!url) {
      lock.classList.add('internal')
      return
    }
    if (url.startsWith('https://')) return // cadeado verde (padrão)
    if (url.startsWith('http://')) lock.classList.add('http')
    else lock.classList.add('internal')
  }

  // =========================================================
  // FAVORITOS (via window.itaBrowser / IPC)
  // =========================================================

  function normalizeFavUrl(f) {
    if (typeof f === 'string') return f
    return (f && (f.url || f.href)) || ''
  }

  async function listFavorites() {
    if (!BR || typeof BR.getFavorites !== 'function') return []
    try {
      const favs = await BR.getFavorites()
      return Array.isArray(favs) ? favs : ((favs && favs.favorites) || [])
    } catch {
      return []
    }
  }

  async function updateStarState() {
    const tab = activeTab()
    const star = el('starBtn')
    if (!tab || !tab.url) {
      star.classList.remove('on')
      return
    }
    const favs = await listFavorites()
    const on = favs.some((f) => normalizeFavUrl(f) === tab.url)
    star.classList.toggle('on', on)
    star.title = on ? 'Remover dos favoritos (Ctrl+D)' : 'Favoritar (Ctrl+D)'
  }

  async function toggleFavorite() {
    const tab = activeTab()
    if (!tab || !tab.url) return
    if (!BR || typeof BR.saveFavorite !== 'function') {
      showToast('warn', 'Favoritos', 'Disponível apenas dentro do ITA Navegador (Electron).')
      return
    }
    const favs = await listFavorites()
    const idx = favs.findIndex((f) => normalizeFavUrl(f) === tab.url)
    if (idx >= 0) {
      await BR.removeFavorite(idx)
      showToast('ok', 'Favorito removido', tab.url)
    } else {
      await BR.saveFavorite({ title: tab.title, url: tab.url, addedAt: nowIso() })
      showToast('ok', 'Favorito salvo', tab.url)
    }
    updateStarState()
  }

  // =========================================================
  // STATUS
  // =========================================================

  function setStatus(kind, text) {
    const dot = el('statusDot')
    dot.className = kind === 'ok' ? 'status-dot' : `status-dot ${kind}`
    el('statusText').textContent = text
  }

  function updateNavButtons() {
    const tab = activeTab()
    el('backBtn').disabled = !tab || tab.histIndex <= 0
    el('fwdBtn').disabled = !tab || tab.histIndex >= tab.history.length - 1
    el('reloadBtn').disabled = !tab || !tab.url
  }

  // =========================================================
  // EVENTOS DO WEBVIEW (carga, título, favicon, erros, pop-ups)
  // =========================================================

  function wireWebView(tab) {
    const wv = tab.webview
    if (!wv) return

    wv.addEventListener('did-start-loading', () => {
      tab.loading = true
      el('loadProgress').classList.add('on')
      if (tab.id === activeId) {
        setStatus('loading', `Carregando ${displayHost(tab.url) || 'página'}…`)
      }
    })

    wv.addEventListener('did-stop-loading', () => {
      tab.loading = false
      if (![...tabs.values()].some((t) => t.loading)) {
        el('loadProgress').classList.remove('on')
      }
      if (tab.id === activeId) setStatus('ok', 'Pronto')
      updateNavButtons()
      scheduleSessionSave()
    })

    wv.addEventListener('did-navigate', (e) => {
      const real = unwrapProxyUrl(e.url)
      tab.url = real
      tab.failed = false
      syncHistoryOnNavigate(tab, real)
      if (tab.id === activeId) {
        updateOmni()
        el('newTabPage').classList.add('hidden')
      }
      scheduleSessionSave()
    })

    wv.addEventListener('did-navigate-in-page', (e) => {
      if (!e.isMainFrame) return
      const real = unwrapProxyUrl(e.url)
      tab.url = real
      syncHistoryOnNavigate(tab, real)
      if (tab.id === activeId) updateOmni()
      scheduleSessionSave()
    })

    wv.addEventListener('page-title-updated', (e) => {
      tab.title = e.title || tab.title
      renderTabMeta(tab)
      scheduleSessionSave()
    })

    wv.addEventListener('page-favicon-updated', (e) => {
      const fav = e.favicons && e.favicons[0]
      if (fav) {
        tab.favicon = fav
        renderTabMeta(tab)
      }
    })

    wv.addEventListener('did-fail-load', (e) => {
      // -3 = navegação abortada (comum em redirecionamentos) — ignorar
      if (e.errorCode === -3 || !e.isMainFrame) return
      tab.failed = true
      if (OFFLINE_ERR_CODES.has(e.errorCode) || !navigator.onLine) {
        // Queda de conexão: aviso discreto (sem travar o app) +
        // recarga automática quando o evento 'online' disparar
        if (tab.id === activeId) {
          setStatus('warn', 'Sem conexão — a página será recarregada quando a internet voltar')
        }
        showToast('warn', 'Você está offline', 'O ITA Navegador vai recarregar esta página assim que a conexão voltar.')
      } else if (tab.id === activeId) {
        setStatus('error', `Falha ao carregar (${e.errorDescription || e.errorCode})`)
      }
    })

    // pop-ups/links com target=_blank abrem em nova aba do ITA
    wv.addEventListener('new-window', (e) => {
      const url = unwrapProxyUrl(e.url)
      if (url && /^https?:/i.test(url)) createTab(url)
    })
  }

  // =========================================================
  // DOWNLOADS (painel em tempo real via IPC)
  // =========================================================

  const downloads = new Map()

  function upsertDownload(d) {
    if (!d || !d.id) return
    const prev = downloads.get(d.id) || {}
    downloads.set(d.id, { ...prev, ...d })
    renderDownloads()
  }

  function renderDownloads() {
    const list = el('downloadsList')
    const items = [...downloads.values()].sort((a, b) =>
      String(b.startedAt || '').localeCompare(String(a.startedAt || ''))
    )
    const activeCount = items.filter((d) => d.state === 'progressing').length

    const badge = el('downloadsBadge')
    badge.hidden = activeCount === 0
    badge.textContent = String(activeCount)

    list.innerHTML = ''
    if (items.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'dl-empty'
      empty.textContent = 'Nenhum download ainda. Os arquivos baixados aparecem aqui em tempo real.'
      list.appendChild(empty)
      return
    }

    for (const d of items) {
      const row = document.createElement('div')
      row.className = 'dl-item'

      const name = document.createElement('div')
      name.className = 'name'
      name.textContent = d.filename || 'arquivo'

      const meta = document.createElement('div')
      meta.className = 'meta'

      const state = document.createElement('span')
      state.className = 'st'
      const pct = d.total > 0 ? Math.min(100, Math.round((d.received / d.total) * 100)) : null
      state.textContent =
        d.state === 'completed' ? 'Concluído'
          : d.state === 'cancelled' ? 'Cancelado'
            : d.state === 'interrupted' ? 'Interrompido'
              : pct != null ? `${pct}%` : 'Baixando…'

      const size = document.createElement('span')
      size.textContent = formatBytes(d.total || d.received)

      meta.append(state, size)
      row.append(name, meta)

      if (d.state === 'progressing') {
        const bar = document.createElement('div')
        bar.className = 'dl-bar'
        const fill = document.createElement('i')
        fill.style.width = `${pct || 4}%`
        bar.appendChild(fill)
        row.appendChild(bar)
      }

      list.appendChild(row)
    }
  }

  function toggleDownloads(force) {
    const panel = el('downloadsPanel')
    const open = typeof force === 'boolean' ? force : !panel.classList.contains('open')
    panel.classList.toggle('open', open)
  }

  // =========================================================
  // TOASTS (segurança e avisos)
  // =========================================================

  function showToast(kind, title, message) {
    const t = el('toast')
    t.className = kind === 'ok' ? 'toast show' : `toast show ${kind}`
    t.innerHTML = '<strong></strong><span></span>'
    t.querySelector('strong').textContent = title
    t.querySelector('span').textContent = message || ''
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => t.classList.remove('show'), 6000)
  }

  // =========================================================
  // SESSÃO — restauração e salvamento automático
  // =========================================================

  function buildSession() {
    return {
      version: 2,
      savedAt: nowIso(),
      activeIndex: Math.max(0, tabOrder.indexOf(activeId)),
      tabs: tabOrder.map((id) => {
        const t = tabs.get(id)
        return { url: t.url || null, title: t.title }
      })
    }
  }

  function scheduleSessionSave() {
    if (!API || typeof API.saveSession !== 'function') return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      try {
        API.saveSession(buildSession())
      } catch {
        // salvamento é best-effort
      }
    }, 800)
  }

  function restoreSession(session) {
    if (!session) return
    const list = Array.isArray(session) ? session : session.tabs
    if (!Array.isArray(list) || list.length === 0) return

    // limpa as abas padrão antes de restaurar
    for (const [, tab] of tabs) {
      if (tab.webview) {
        try {
          tab.webview.remove()
        } catch {
          // já removida
        }
      }
      tab.el.remove()
    }
    tabs.clear()
    tabOrder = []
    activeId = null

    const urls = list
      .map((t) => (typeof t === 'string' ? t : t && t.url))
      .filter(Boolean)

    if (urls.length === 0) {
      createTab(null)
      return
    }
    urls.forEach((u, i) => createTab(u, { activate: i === urls.length - 1 }))
    setStatus('ok', `Sessão restaurada (${urls.length} ${urls.length === 1 ? 'aba' : 'abas'})`)
  }

  // =========================================================
  // IPC DO ELECTRON — janela, downloads, segurança, sessão
  // =========================================================

  function wireIpc() {
    if (!API) {
      // pré-visualização fora do Electron (servidor local em navegador comum)
      document.body.classList.add('web-preview')
      return
    }

    if (typeof API.onDownloadStarted === 'function') API.onDownloadStarted(upsertDownload)
    if (typeof API.onDownloadProgress === 'function') API.onDownloadProgress(upsertDownload)
    if (typeof API.onDownloadDone === 'function') API.onDownloadDone(upsertDownload)

    if (typeof API.onSecurityBlock === 'function') {
      API.onSecurityBlock((v) => {
        showToast('error', 'Acesso bloqueado por segurança', `${(v && v.reason) || 'Site perigoso'} — ${(v && v.url) || ''}`)
        setStatus('error', 'Navegação bloqueada pelo protetor ITA')
      })
    }

    if (typeof API.onSecurityWarning === 'function') {
      API.onSecurityWarning((v) => {
        showToast('warn', 'Atenção', `${(v && v.reason) || ''} — ${(v && v.url) || ''}`)
      })
    }

    if (typeof API.onRestoreSession === 'function') {
      API.onRestoreSession((session) => restoreSession(session))
    }

    if (typeof API.getDownloads === 'function') {
      API.getDownloads()
        .then((list) => {
          if (Array.isArray(list)) list.forEach(upsertDownload)
        })
        .catch(() => { })
    }
  }

  // =========================================================
  // ATALHOS DE TECLADO
  // (Ctrl+R / F5 / Ctrl+W ficam no menu do Electron — ver main.js)
  // =========================================================

  function globalShortcuts(e) {
    const mod = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()

    if (mod && key === 't') {
      e.preventDefault()
      createTab(null)
      el('urlInput').focus()
    } else if (mod && key === 'l') {
      e.preventDefault()
      el('urlInput').focus()
    } else if (e.key === 'F6') {
      e.preventDefault()
      el('urlInput').focus()
    } else if (mod && key === 'd') {
      e.preventDefault()
      toggleFavorite()
    } else if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault()
      goBack()
    } else if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault()
      goForward()
    } else if (mod && e.key === 'Tab') {
      e.preventDefault()
      if (tabOrder.length > 1) {
        const idx = tabOrder.indexOf(activeId)
        const next = e.shiftKey
          ? (idx - 1 + tabOrder.length) % tabOrder.length
          : (idx + 1) % tabOrder.length
        activateTab(tabOrder[next])
      }
    }
  }

  // =========================================================
  // LIGAÇÕES DA INTERFACE ESTÁTICA
  // =========================================================

  function wireStaticUi() {
    el('backBtn').addEventListener('click', goBack)
    el('fwdBtn').addEventListener('click', goForward)
    el('reloadBtn').addEventListener('click', reload)
    el('homeBtn').addEventListener('click', goHome)
    el('newTabBtn').addEventListener('click', () => {
      createTab(null)
      el('urlInput').focus()
    })

    el('omniboxForm').addEventListener('submit', (e) => {
      e.preventDefault()
      submitOmni(el('urlInput').value)
    })
    el('urlInput').addEventListener('focus', (e) => e.target.select())
    el('urlInput').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') e.target.blur()
    })

    el('starBtn').addEventListener('click', toggleFavorite)
    el('downloadsBtn').addEventListener('click', () => toggleDownloads())
    el('downloadsClose').addEventListener('click', () => toggleDownloads(false))

    // Página de nova aba: busca e atalhos
    el('newTabSearch').addEventListener('submit', (e) => {
      e.preventDefault()
      submitOmni(el('newTabInput').value)
      el('newTabInput').value = ''
    })
    document.querySelectorAll('.shortcut').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = activeTab()
        if (tab && btn.dataset.url) navigateTab(tab, btn.dataset.url)
      })
    })

    document.addEventListener('keydown', globalShortcuts)
    window.addEventListener('beforeunload', () => {
      try {
        if (API && typeof API.saveSession === 'function') API.saveSession(buildSession())
      } catch {
        // encerramento é best-effort
      }
    })

    renderDownloads()
  }

  // =========================================================
  // TEMAS MENSAIS (janeiro → janeiro) — a página de nova aba
  // muda o brilho, a etiqueta e (opcionalmente) a imagem a cada
  // mês, sem precisar mexer em código. Arte customizada (PNG
  // com fundo transparente) em public/brand/themes/, aceitando
  // dois nomes:
  //   tema-<nome-do-mes>.png  (ex.: tema-junho-namorados.png)
  //   tema-<mes>.png          (ex.: tema-5.png)
  // Sem arquivo para o mês, mantém a logo oficial.
  // =========================================================

  const MONTH_THEMES = [
    { emoji: '🎆', label: 'Ano Novo & Verão',           glow: 'rgba(110, 168, 255, .32)', art: 'tema-janeiro-verao.png' },
    { emoji: '🎭', label: 'Carnaval',                   glow: 'rgba(255, 119, 102, .30)', art: 'tema-fevereiro-carnaval.png' },
    { emoji: '🍂', label: 'Outono & Dia da Mulher',     glow: 'rgba(255, 150, 70, .28)',  art: 'tema-marco-outono.png' },
    { emoji: '🐰', label: 'Páscoa',                     glow: 'rgba(200, 150, 255, .30)', art: 'tema-abril-pascoa.png' },
    { emoji: '💐', label: 'Dia das Mães',               glow: 'rgba(255, 140, 180, .30)', art: 'tema-maio-maes.png' },
    { emoji: '💛', label: 'Namorados & Festa Junina',   glow: 'rgba(255, 170, 80, .32)',  art: 'tema-junho-namorados.png' },
    { emoji: '🎮', label: 'Férias de Inverno',          glow: 'rgba(120, 200, 255, .30)', art: 'tema-julho-ferias.png' },
    { emoji: '👑', label: 'Dia dos Pais',               glow: 'rgba(80, 200, 200, .28)',  art: 'tema-agosto-pais.png' },
    { emoji: '🌸', label: 'Primavera & Pátria',         glow: 'rgba(120, 230, 160, .30)', art: 'tema-setembro-primavera.png' },
    { emoji: '🎀', label: 'Outubro Rosa',               glow: 'rgba(255, 105, 180, .34)', art: 'tema-outubro-halloween.png' },
    { emoji: '🛒', label: 'Black Friday & Proclamação', glow: 'rgba(255, 196, 87, .30)',  art: 'tema-novembro-black.png' },
    { emoji: '🎄', label: 'Natal & Fim de Ano',         glow: 'rgba(255, 120, 120, .32)', art: 'tema-dezembro-natal.png' }
  ]

  // Datas especiais (dia + mês, "MM-DD") que SOBREPÕEM o tema do mês —
  // ex.: 15/03, aniversário do Grupo Itavarig (dispara todo ano):
  // banner dourado pulsante, emblema na logo e favicon no dia.
  const SPECIAL_DATES = {
    '03-15': {
      emoji: '🎉',
      label: 'Aniversário do Grupo Itavarig',
      glow: 'rgba(255, 102, 0, .45)',
      art: 'aniversario-itavarig.png',
      banner: '🎉 Parabéns, Grupo Itavarig! 15 de março — aniversário oficial ✈️'
    }
  }

  function applySeasonalTheme() {
    try {
      const now = new Date()
      const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const special = SPECIAL_DATES[mmdd]
      const theme = special || MONTH_THEMES[now.getMonth()]
      if (!theme) return
      const page = el('newTabPage')
      const chip = el('newTabSeason')
      const logo = page ? page.querySelector('.newtab-logo-img') : null

      if (page) page.style.setProperty('--season-glow', theme.glow)

      if (logo && serverBase) {
        // Se existir uma arte do dia/mês, ela substitui a logo padrão.
        // Ordem: arte especial (ou tema-<nome-do-mes>.png) → tema-<mes>.png → logo oficial.
        const candidates = special ? [special.art] : [theme.art, `tema-${now.getMonth()}.png`]
        const tryNext = (i) => {
          if (i >= candidates.length) return
          const probe = new Image()
          probe.onload = () => { logo.src = probe.src }
          probe.onerror = () => tryNext(i + 1)
          probe.src = `${serverBase}/brand/themes/${candidates[i]}`
        }
        tryNext(0)
      }

      if (special) {
        // Banner comemorativo + favicon assume o emblema no dia.
        const banner = el('newTabSpecialBanner')
        if (banner) {
          banner.textContent = special.banner
          banner.hidden = false
        }
        const fav = document.querySelector('link[rel="icon"][sizes="128x128"]')
        if (fav && serverBase) fav.href = `${serverBase}/brand/themes/${special.art}`
      }

      if (chip) {
        chip.textContent = `${theme.emoji} ${theme.label}`
        chip.hidden = false
      }
    } catch {
      // tema sazonal nunca deve quebrar a página inicial
    }
  }

  // =========================================================
  // AVIÃO DO CLIQUE — micro-interação da identidade aeronáutica:
  // todo botão/link/aba solta um ✈️ que sobe e some. Desligada
  // automaticamente em prefers-reduced-motion; nunca quebra a UI.
  // =========================================================

  function wirePlaneClicks() {
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      let lastFlight = 0
      document.addEventListener('click', (ev) => {
        const target = ev.target instanceof Element
          ? ev.target.closest('button, a, .tab, .shortcut')
          : null
        if (!target) return
        const t = Date.now()
        if (t - lastFlight < 120) return // evita enxame em cliques repetidos
        lastFlight = t
        spawnPlane(ev.clientX, ev.clientY)
      }, true)
    } catch {
      // decoração pura: falha silenciosa
    }
  }

  function spawnPlane(x, y) {
    const plane = document.createElement('span')
    plane.className = 'flying-plane'
    plane.textContent = '✈️'
    plane.style.left = `${x}px`
    plane.style.top = `${y}px`
    document.body.appendChild(plane)
    setTimeout(() => plane.remove(), 950)
  }

  // =========================================================
  // MODO OFFLINE / RECONEXÃO — nenhum navegador garante 100% de
  // conexão, mas o ITA avisa a queda em tempo real (aviso
  // discreto, sem travar o app) e se recupera sozinho: quando a
  // conexão volta, a aba ativa é recarregada automaticamente.
  // No site, o Service Worker (public/sw.js) mantém a interface
  // abrindo mesmo com a internet oscilando.
  // =========================================================

  const OFFLINE_ERR_CODES = new Set([
    -7,   // TIMED_OUT
    -100, // CONNECTION_CLOSED
    -101, // CONNECTION_RESET
    -102, // CONNECTION_REFUSED
    -105, // NAME_NOT_RESOLVED
    -106, // INTERNET_DISCONNECTED
    -109, // ADDRESS_UNREACHABLE
    -118  // CONNECTION_TIMED_OUT
  ])

  let wasOffline = false

  function wireConnectivity() {
    wasOffline = !navigator.onLine
    window.addEventListener('offline', () => {
      wasOffline = true
      setStatus('warn', 'Offline — as páginas não carregam sem internet')
      showToast('warn', 'Você está offline', 'A interface segue funcionando. As páginas serão recarregadas quando a conexão voltar.')
    })
    window.addEventListener('online', () => {
      if (!wasOffline) return
      wasOffline = false
      setStatus('ok', 'Conexão restabelecida')
      showToast('ok', 'Conexão restabelecida', 'Recarregando a página atual…')
      const tab = activeTab()
      if (tab && tab.url) reload()
    })
  }

  // =========================================================
  // BOOT — resolve o servidor local e abre a primeira aba
  // =========================================================

  async function boot() {
    wireIpc()
    wireStaticUi()
    wireConnectivity()
    wirePlaneClicks()

    // Base do servidor local (proxy de navegação)
    try {
      if (BR && typeof BR.getLocalServerUrl === 'function') {
        const u = await BR.getLocalServerUrl()
        if (u) serverBase = String(u).replace(/\/+$/, '')
      }
    } catch {
      // cai para a origem atual
    }
    if (!serverBase || !/^https?:/i.test(serverBase)) {
      serverBase = location.origin.startsWith('http')
        ? location.origin
        : 'http://localhost:8080'
    }
    el('serverTag').textContent = `ITA Local Server • ${displayHost(serverBase) || serverBase}`

    // Chip "navegação protegida" (mockup 4) — o proxy interno só existe no app
    const secureChip = el('newTabSecure')
    if (secureChip) {
      secureChip.textContent = API
        ? '🔒 Navegação protegida • Proxy interno'
        : '🔒 Modo preview • Proxy indisponível'
      secureChip.hidden = false
    }

    applySeasonalTheme()

    if (tabOrder.length === 0) createTab(null)
    setStatus('ok', 'Pronto')
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }
})()