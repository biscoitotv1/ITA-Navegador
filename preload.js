const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('itaBrowser', {
  navigate: (url) => ipcRenderer.invoke('navigate', url),
  loadLocalFile: (filePath) => ipcRenderer.invoke('load-local-file', filePath),
  goBack: () => ipcRenderer.invoke('go-back'),
  goForward: () => ipcRenderer.invoke('go-forward'),
  reload: () => ipcRenderer.invoke('reload'),
  getFavorites: () => ipcRenderer.invoke('get-favorites'),
  saveFavorite: (item) => ipcRenderer.invoke('save-favorite', item),
  removeFavorite: (index) => ipcRenderer.invoke('remove-favorite', index),
  switchModule: (name) => ipcRenderer.invoke('switch-module', name),
  getModules: () => ipcRenderer.invoke('get-modules'),
  getCurrentModule: () => ipcRenderer.invoke('get-current-module'),
  getLocalServerUrl: () => ipcRenderer.invoke('get-local-server-url'),
  studioCreateProject: (name) => ipcRenderer.invoke('studio-create-project', name),
  studioListProjects: () => ipcRenderer.invoke('studio-list-projects'),
  addCube: () => ipcRenderer.invoke('editor-add-cube'),
  addSphere: () => ipcRenderer.invoke('editor-add-sphere'),
  addLight: () => ipcRenderer.invoke('editor-add-light'),
  addMainCamera: () => ipcRenderer.invoke('editor-add-main-camera'),
  getScene: () => ipcRenderer.invoke('editor-get-scene'),
  selectObject: (id) => ipcRenderer.invoke('editor-select-object', id),
  clearScene: () => ipcRenderer.invoke('editor-clear-scene'),
  setTransformMode: (mode) => ipcRenderer.invoke('editor-set-transform-mode', mode),
  updateObject: (id, property, value) => ipcRenderer.invoke('editor-update-object', id, property, value),
  duplicateObject: (id) => ipcRenderer.invoke('editor-duplicate-object', id),
  deleteObject: (id) => ipcRenderer.invoke('editor-delete-object', id),
  moveObject: (fromIndex, toIndex) => ipcRenderer.invoke('editor-move-object', fromIndex, toIndex),
  saveScene: (filePath) => ipcRenderer.invoke('editor-save-scene', filePath),
  loadScene: (filePath) => ipcRenderer.invoke('editor-load-scene', filePath),
  addComponent: (objectId, componentType) => ipcRenderer.invoke('editor-add-component', objectId, componentType),
  removeComponent: (objectId, componentType) => ipcRenderer.invoke('editor-remove-component', objectId, componentType),
  updateComponent: (objectId, componentType, property, value) => ipcRenderer.invoke('editor-update-component', objectId, componentType, property, value),
  getComponents: (objectId) => ipcRenderer.invoke('editor-get-components', objectId),
  getAvailableComponents: () => ipcRenderer.invoke('editor-get-available-components'),
  importAssetToScene: (assetId, position) => ipcRenderer.invoke('editor-import-asset', assetId, position),
  listAssets: () => ipcRenderer.invoke('assets-list'),
  listAssetsByCategory: (category) => ipcRenderer.invoke('assets-list-by-category', category),
  searchAssets: (query) => ipcRenderer.invoke('assets-search', query),
  importAsset: (filePath, category) => ipcRenderer.invoke('assets-import', filePath, category),
  deleteAsset: (assetId) => ipcRenderer.invoke('assets-delete', assetId),
  getAsset: (assetId) => ipcRenderer.invoke('assets-get', assetId),
  playModePlay: () => ipcRenderer.invoke('playmode-play'),
  playModePause: () => ipcRenderer.invoke('playmode-pause'),
  playModeResume: () => ipcRenderer.invoke('playmode-resume'),
  playModeStop: () => ipcRenderer.invoke('playmode-stop'),
  playModeGetState: () => ipcRenderer.invoke('playmode-state'),
  playModeRegisterScript: (scriptName, updateFn) => ipcRenderer.invoke('playmode-register-script', scriptName, updateFn),
  playModeUnregisterScript: (scriptName) => ipcRenderer.invoke('playmode-unregister-script', scriptName),
  playModeRegisterPhysics: (objectId) => ipcRenderer.invoke('playmode-register-physics', objectId),
  onPlayModeState: (callback) => {
    const handler = (_event, state) => callback(state)
    ipcRenderer.on('play-mode-state', handler)
    return () => ipcRenderer.removeListener('play-mode-state', handler)
  },
  createProject: (name, settings) => ipcRenderer.invoke('project-create', name, settings),
  loadProject: (name) => ipcRenderer.invoke('project-load', name),
  deleteProject: (name) => ipcRenderer.invoke('project-delete', name),
  listProjects: () => ipcRenderer.invoke('project-list'),
  getCurrentProject: () => ipcRenderer.invoke('project-get-current'),
  saveScene: (sceneName, sceneData) => ipcRenderer.invoke('scene-save', sceneName, sceneData),
  loadScene: (sceneName) => ipcRenderer.invoke('scene-load', sceneName),
  listScenes: () => ipcRenderer.invoke('scene-list'),
  getProjectPath: () => ipcRenderer.invoke('project-get-path'),
  getScenesPath: () => ipcRenderer.invoke('project-get-scenes-path'),
  getAssetsPath: () => ipcRenderer.invoke('project-get-assets-path'),
  generateAssetPreview: (assetId) => ipcRenderer.invoke('assets-generate-preview', assetId),
  aiChat: (message, history) => ipcRenderer.invoke('ai-chat', message, history),
  aiGenerateCode: (prompt, context) => ipcRenderer.invoke('ai-generate-code', prompt, context),
  aiExplainCode: (code, language) => ipcRenderer.invoke('ai-explain-code', code, language),
  aiRefactorCode: (code, instructions, language) => ipcRenderer.invoke('ai-refactor-code', code, instructions, language),
  aiCreateScene: (objects, environment) => ipcRenderer.invoke('ai-create-scene', objects, environment),
  aiCreateScript: (type, requirements) => ipcRenderer.invoke('ai-create-script', type, requirements),
  aiCreatePhysics: (config) => ipcRenderer.invoke('ai-create-physics', config),
  aiDebugCode: (code, error, language) => ipcRenderer.invoke('ai-debug-code', code, error, language),
  aiOptimizeCode: (code, language) => ipcRenderer.invoke('ai-optimize-code', code, language),
  aiDocumentation: (code, language) => ipcRenderer.invoke('ai-documentation', code, language),
  aiCheckProviders: () => ipcRenderer.invoke('ai-check-providers'),
  aiSetProvider: (name) => ipcRenderer.invoke('ai-set-provider', name),
  aiGetContext: () => ipcRenderer.invoke('ai-get-context'),
  aiUpdateContext: (key, value) => ipcRenderer.invoke('ai-update-context', key, value),
  networkHost: (port, roomName) => ipcRenderer.invoke('network-host', port, roomName),
  networkJoin: (roomId, playerName) => ipcRenderer.invoke('network-join', roomId, playerName),
  networkLeave: () => ipcRenderer.invoke('network-leave'),
  networkSendEvent: (type, data) => ipcRenderer.invoke('network-send-event', type, data),
  networkBroadcastState: () => ipcRenderer.invoke('network-broadcast-state'),
  networkUpdateState: (key, value) => ipcRenderer.invoke('network-update-state', key, value),
  networkGetRoomInfo: () => ipcRenderer.invoke('network-get-room-info'),
  networkGetPlayerInfo: () => ipcRenderer.invoke('network-get-player-info'),
  networkGetPlayers: () => ipcRenderer.invoke('network-get-players'),
  networkGetEvents: () => ipcRenderer.invoke('network-get-events'),
  networkClearEvents: () => ipcRenderer.invoke('network-clear-events'),
  networkIsConnected: () => ipcRenderer.invoke('network-is-connected'),
  networkIsHost: () => ipcRenderer.invoke('network-is-host'),
  buildStart: (projectPath, options) => ipcRenderer.invoke('build-start', projectPath, options),
  buildCancel: () => ipcRenderer.invoke('build-cancel'),
  buildStatus: () => ipcRenderer.invoke('build-status'),
  buildPlatforms: () => ipcRenderer.invoke('build-platforms'),
  onBuildLog: (callback) => {
    const handler = (_event, log) => callback(log)
    ipcRenderer.on('buildLog', handler)
    return () => ipcRenderer.removeListener('buildLog', handler)
  },
  physicsAddBody: (objectId, config) => ipcRenderer.invoke('physics-add-body', objectId, config),
  physicsRemoveBody: (objectId) => ipcRenderer.invoke('physics-remove-body', objectId),
  physicsGetBody: (objectId) => ipcRenderer.invoke('physics-get-body', objectId),
  physicsSetGravity: (x, y, z) => ipcRenderer.invoke('physics-set-gravity', x, y, z),
  physicsSetGround: (y) => ipcRenderer.invoke('physics-set-ground', y),
  physicsRaycast: (origin, direction, maxDistance) => ipcRenderer.invoke('physics-raycast', origin, direction, maxDistance),
  physicsOnCollision: (bodyA, bodyB, callback) => ipcRenderer.invoke('physics-on-collision', bodyA, bodyB),
  physicsStart: () => ipcRenderer.invoke('physics-start'),
  physicsStop: () => ipcRenderer.invoke('physics-stop'),
  physicsClear: () => ipcRenderer.invoke('physics-clear'),
  onPhysicsCollision: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('physics-collision', handler)
    return () => ipcRenderer.removeListener('physics-collision', handler)
  },
  audioInit: () => ipcRenderer.invoke('audio-init'),
  audioLoadClip: (id, filePath) => ipcRenderer.invoke('audio-load-clip', id, filePath),
  audioCreateSource: () => ipcRenderer.invoke('audio-create-source'),
  audioRemoveSource: (id) => ipcRenderer.invoke('audio-remove-source', id),
  audioPlay: (id) => ipcRenderer.invoke('audio-play', id),
  audioPause: (id) => ipcRenderer.invoke('audio-pause', id),
  audioResume: (id) => ipcRenderer.invoke('audio-resume', id),
  audioStop: (id) => ipcRenderer.invoke('audio-stop', id),
  audioStopAll: () => ipcRenderer.invoke('audio-stop-all'),
  audioSetVolume: (id, volume) => ipcRenderer.invoke('audio-set-volume', id, volume),
  audioSetMasterVolume: (volume) => ipcRenderer.invoke('audio-set-master-volume', volume),
  audioSetSpatialBlend: (id, blend) => ipcRenderer.invoke('audio-set-spatial-blend', id, blend),
  audioGetClipInfo: (id) => ipcRenderer.invoke('audio-get-clip-info', id),
  audioGetSourceInfo: (id) => ipcRenderer.invoke('audio-get-source-info', id),
  audioGetAllClips: () => ipcRenderer.invoke('audio-get-all-clips'),
  audioGetAllSources: () => ipcRenderer.invoke('audio-get-all-sources'),
  scriptCreate: (name, content, language) => ipcRenderer.invoke('script-create', name, content, language),
  scriptLoad: (scriptPath) => ipcRenderer.invoke('script-load', scriptPath),
  scriptSave: (scriptId) => ipcRenderer.invoke('script-save', scriptId),
  scriptUpdate: (scriptId, content) => ipcRenderer.invoke('script-update', scriptId, content),
  scriptDelete: (scriptId) => ipcRenderer.invoke('script-delete', scriptId),
  scriptGet: (scriptId) => ipcRenderer.invoke('script-get', scriptId),
  scriptList: () => ipcRenderer.invoke('script-list'),
  scriptValidate: (scriptId, language) => ipcRenderer.invoke('script-validate', scriptId, language),
  scriptHighlight: (code, language) => ipcRenderer.invoke('script-highlight', code, language),
  onNavigationState: (callback) => {
    const handler = (_event, state) => callback(state)
    ipcRenderer.on('navigation-state', handler)
    return () => ipcRenderer.removeListener('navigation-state', handler)
  },
  onModuleSwitch: (callback) => {
    const handler = (_event, moduleName) => callback(moduleName)
    ipcRenderer.on('module-switch', handler)
    return () => ipcRenderer.removeListener('module-switch', handler)
  },
  onSelectionChanged: (callback) => {
    const handler = (_event, obj) => callback(obj)
    ipcRenderer.on('selection-changed', handler)
    return () => ipcRenderer.removeListener('selection-changed', handler)
  }
})

// =========================================================
// ITA AI — Agente de Engenharia (Agent Core)
// Ciclo: Observar → Analisar → Planejar → Executar → Verificar
// =========================================================

contextBridge.exposeInMainWorld('itaAgent', {
  observe: () => ipcRenderer.invoke('agent-observe'),
  analyze: () => ipcRenderer.invoke('agent-analyze'),
  plan: (goal) => ipcRenderer.invoke('agent-plan', goal),
  executeStep: (stepId, confirmed) => ipcRenderer.invoke('agent-execute-step', stepId, confirmed),
  approve: (approvalId) => ipcRenderer.invoke('agent-approve', approvalId),
  reject: (approvalId, reason) => ipcRenderer.invoke('agent-reject', approvalId, reason),
  verify: () => ipcRenderer.invoke('agent-verify'),
  runCycle: (goal) => ipcRenderer.invoke('agent-run-cycle', goal),
  getStatus: () => ipcRenderer.invoke('agent-status'),
  getActivity: () => ipcRenderer.invoke('agent-activity'),
  getOptimizerReport: () => ipcRenderer.invoke('agent-optimizer-report'),
  opportunityAction: (id, action) => ipcRenderer.invoke('agent-opportunity-action', id, action),
  getMemory: () => ipcRenderer.invoke('agent-memory'),
  saveNote: (key, value) => ipcRenderer.invoke('agent-memory-note', key, value),
  addCompletedFeature: (title, details) => ipcRenderer.invoke('agent-memory-feature', title, details),
  addPendingFeature: (title, details) => ipcRenderer.invoke('agent-memory-pending', title, details),
  addDecision: (text) => ipcRenderer.invoke('agent-memory-decision', text),
  resetMemory: () => ipcRenderer.invoke('agent-memory-reset'),
  runCommand: (command, confirmed) => ipcRenderer.invoke('agent-command-run', command, confirmed),
  classifyCommand: (command) => ipcRenderer.invoke('agent-command-classify', command),
  getCommandHistory: () => ipcRenderer.invoke('agent-command-history'),
  onAgentEvent: (callback) => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('agent-event', handler)
    return () => ipcRenderer.removeListener('agent-event', handler)
  }
})

// =========================================================
// Recursos do navegador: Downloads, Sessão, Segurança
// =========================================================

contextBridge.exposeInMainWorld('itaBrowserAPI', {
  getDownloads:   () => ipcRenderer.invoke('get-downloads'),
  cancelDownload: (id) => ipcRenderer.invoke('cancel-download', id),
  saveSession:    (data) => ipcRenderer.invoke('save-session', data),
  getSession:     () => ipcRenderer.invoke('get-session'),
  getFavorites:   () => ipcRenderer.invoke('get-favorites'),
  getAlwaysOnTop: () => ipcRenderer.invoke('get-always-on-top'),
  getWindowState: () => ipcRenderer.invoke('get-window-state'),

  // ── Controles de janela (barra de títulos customizada ITA) ──
  minimizeWindow:       () => ipcRenderer.send('window-minimize'),
  toggleMaximizeWindow: () => ipcRenderer.send('window-maximize-toggle'),
  closeWindow:          () => ipcRenderer.send('window-close'),
  onWindowState: (cb) => {
    const h = (_e, d) => cb(d)
    ipcRenderer.on('window-state-changed', h)
    return () => ipcRenderer.removeListener('window-state-changed', h)
  },

  // ── Eventos de download (tempo real) ──
  onDownloadStarted: (cb) => {
    const h = (_e, d) => cb(d)
    ipcRenderer.on('download-started', h)
    return () => ipcRenderer.removeListener('download-started', h)
  },
  onDownloadProgress: (cb) => {
    const h = (_e, d) => cb(d)
    ipcRenderer.on('download-progress', h)
    return () => ipcRenderer.removeListener('download-progress', h)
  },
  onDownloadDone: (cb) => {
    const h = (_e, d) => cb(d)
    ipcRenderer.on('download-done', h)
    return () => ipcRenderer.removeListener('download-done', h)
  },

  // ── Segurança ──
  onSecurityBlock: (cb) => {
    const h = (_e, v) => cb(v)
    ipcRenderer.on('security-block', h)
    return () => ipcRenderer.removeListener('security-block', h)
  },
  onSecurityWarning: (cb) => {
    const h = (_e, v) => cb(v)
    ipcRenderer.on('security-warning', h)
    return () => ipcRenderer.removeListener('security-warning', h)
  },

  // ── Sessão ──
  onRestoreSession: (cb) => {
    const h = (_e, s) => cb(s)
    ipcRenderer.on('restore-session', h)
    return () => ipcRenderer.removeListener('restore-session', h)
  },

  // ── Eventos de menu (Arquivo / Exibir / IA / Janela) ──
  onOpenProjectFolder: (cb) => {
    const h = (_e, d) => cb(d)
    ipcRenderer.on('open-project-folder', h)
    return () => ipcRenderer.removeListener('open-project-folder', h)
  },
  onMenuBuildUniversal: (cb) => {
    const h = (_e, d) => cb(d)
    ipcRenderer.on('menu-build-universal', h)
    return () => ipcRenderer.removeListener('menu-build-universal', h)
  },
  onMenuDepManager: (cb) => {
    const h = (_e, d) => cb(d)
    ipcRenderer.on('menu-dep-manager', h)
    return () => ipcRenderer.removeListener('menu-dep-manager', h)
  },
  onToggleAiSidebar: (cb) => {
    const h = (_e, d) => cb(d)
    ipcRenderer.on('toggle-ai-sidebar', h)
    return () => ipcRenderer.removeListener('toggle-ai-sidebar', h)
  },
  onAlwaysOnTopChanged: (cb) => {
    const h = (_e, d) => cb(d)
    ipcRenderer.on('always-on-top-changed', h)
    return () => ipcRenderer.removeListener('always-on-top-changed', h)
  },
  onWindowModeChanged: (cb) => {
    const h = (_e, d) => cb(d)
    ipcRenderer.on('window-mode-changed', h)
    return () => ipcRenderer.removeListener('window-mode-changed', h)
  },
  onCacheCleared: (cb) => {
    const h = (_e, d) => cb(d)
    ipcRenderer.on('cache-cleared', h)
    return () => ipcRenderer.removeListener('cache-cleared', h)
  },

  // ── Atalhos de aba vindos do menu Electron (Ctrl+R / F5 / F12) ──
  onTabReload: (cb) => {
    const h = (_e, d) => cb(d)
    ipcRenderer.on('tab-reload', h)
    return () => ipcRenderer.removeListener('tab-reload', h)
  },
  onTabDevTools: (cb) => {
    const h = (_e, d) => cb(d)
    ipcRenderer.on('tab-devtools', h)
    return () => ipcRenderer.removeListener('tab-devtools', h)
  },
  toggleMainDevTools: () => ipcRenderer.invoke('toggle-main-devtools'),

  // ── Eventos de IA (resultado de otimização de código) ──
  onAiOptimizeResult: (cb) => {
    const h = (_e, d) => cb(d)
    ipcRenderer.on('ai-optimize-result', h)
    return () => ipcRenderer.removeListener('ai-optimize-result', h)
  },
  onAiOptimizeError: (cb) => {
    const h = (_e, d) => cb(d)
    ipcRenderer.on('ai-optimize-error', h)
    return () => ipcRenderer.removeListener('ai-optimize-error', h)
  },
  onEditorInsertDiagnosticLog: (cb) => {
    const h = (_e, d) => cb(d)
    ipcRenderer.on('editor-insert-diagnostic-log', h)
    return () => ipcRenderer.removeListener('editor-insert-diagnostic-log', h)
  }
})
