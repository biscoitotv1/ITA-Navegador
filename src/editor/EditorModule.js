const { Scene, SceneObject, Vector3 } = require('../engine/Scene')
const AssetManager = require('../assets/AssetManager')
const Components = require('../components/Components')
const ProjectManager = require('../studio/ProjectManager')
const PhysicsEngine = require('../physics/PhysicsEngine')
const AudioSystem = require('../audio/AudioSystem')

class PlayModeSystem {
  constructor(editorModule) {
    this.editor = editorModule
    this.state = 'stopped'
    this.animationId = null
    this.time = 0
    this.deltaTime = 0
    this.lastTime = 0
    this.physicsObjects = []
    this.scripts = []
    this.events = []
  }

  play() {
    if (this.state === 'playing') return
    this.state = 'playing'
    this.snapshotScene()
    this.syncPhysicsBodies()
    PhysicsEngine.start()
    this.startLoop()
    this.editor.mainWindow?.webContents?.send('play-mode-state', { state: 'playing' })
  }

  pause() {
    if (this.state !== 'playing') return
    this.state = 'paused'
    this.stopLoop()
    PhysicsEngine.stop()
    this.editor.mainWindow?.webContents?.send('play-mode-state', { state: 'paused' })
  }

  resume() {
    if (this.state !== 'paused') return
    this.state = 'playing'
    PhysicsEngine.start()
    this.startLoop()
    this.editor.mainWindow?.webContents?.send('play-mode-state', { state: 'playing' })
  }

  stop() {
    if (this.state === 'stopped') return
    this.state = 'stopped'
    this.stopLoop()
    PhysicsEngine.stop()
    this.restoreScene()
    this.editor.mainWindow?.webContents?.send('play-mode-state', { state: 'stopped' })
  }

  snapshotScene() {
    this.snapshot = this.editor.scene.objects.map(obj => ({
      id: obj.id,
      position: obj.position.clone(),
      rotation: obj.rotation.clone(),
      scale: obj.scale.clone()
    }))
  }

  syncPhysicsBodies() {
    this.editor.scene.objects.forEach(obj => {
      const rigidbody = obj.components?.find(c => c.type === 'rigidbody')
      if (rigidbody && !PhysicsEngine.getBody(obj.id)) {
        this.registerPhysicsObject(obj.id)
      }
    })
  }

  restoreScene() {
    if (!this.snapshot) return
    this.snapshot.forEach(saved => {
      const obj = this.editor.scene.objects.find(o => o.id === saved.id)
      if (obj) {
        obj.position.set(saved.position.x, saved.position.y, saved.position.z)
        obj.rotation.set(saved.rotation.x, saved.rotation.y, saved.rotation.z)
        obj.scale.set(saved.scale.x, saved.scale.y, saved.scale.z)
      }
    })
    this.snapshot = null
    PhysicsEngine.clear()
  }

  startLoop() {
    // Usa timer do Node (processo main do Electron não possui requestAnimationFrame)
    const fixedStep = 1 / 60
    this.animationId = setInterval(() => {
      if (this.state !== 'playing') return
      this.deltaTime = fixedStep
      this.time += this.deltaTime
      this.update(this.deltaTime)
    }, fixedStep * 1000)
  }

  stopLoop() {
    if (this.animationId) {
      clearInterval(this.animationId)
      this.animationId = null
    }
  }

  update(dt) {
    this.updatePhysics(dt)
    this.updateAudio(dt)
    this.updateScripts(dt)
    this.updateComponents(dt)
    this.emit('playModeUpdate', { time: this.time, dt })
  }

  updatePhysics(dt) {
    PhysicsEngine.update(dt)

    PhysicsEngine.bodies.forEach((body, objectId) => {
      const obj = this.editor.scene.objects.find(o => o.id === objectId)
      if (!obj) return

      if (!obj._physicsSynced) {
        obj.position.set(body.position.x, body.position.y, body.position.z)
        obj._physicsSynced = true
      } else {
        obj.position.set(body.position.x, body.position.y, body.position.z)
      }
    })
  }

  updateAudio(dt) {
    AudioSystem.update()
  }

  updateScripts(dt) {
    this.scripts.forEach(script => {
      if (script.enabled && script.update) {
        try {
          script.update(dt, this.time)
        } catch {
          // ignore script errors in play mode
        }
      }
    })
  }

  updateComponents(dt) {
    this.editor.scene.objects.forEach(obj => {
      if (!obj.visible) return
      obj.components?.forEach(component => {
        if (component.enabled && component.update) {
          try {
            component.update(dt, this.time, obj)
          } catch {
            // ignore
          }
        }
      })
    })
  }

  registerPhysicsObject(objectId) {
    const obj = this.editor.scene.objects.find(o => o.id === objectId)
    if (!obj) return

    const rigidbody = obj.components?.find(c => c.type === 'rigidbody')
    if (!rigidbody) return

    const collider = obj.components?.find(c => c.type === 'collider')
    const shape = collider ? collider.shape : 'box'

    PhysicsEngine.addBody(objectId, {
      x: obj.position.x,
      y: obj.position.y,
      z: obj.position.z,
      mass: rigidbody.mass || 1,
      drag: rigidbody.drag || 0.1,
      useGravity: rigidbody.useGravity !== false,
      isKinematic: rigidbody.isKinematic || false,
      shape,
      width: obj.scale.x || 1,
      height: obj.scale.y || 1,
      depth: obj.scale.z || 1,
      friction: 0.5,
      restitution: 0.3,
      constraints: rigidbody.constraints || { freezePosition: [false, false, false], freezeRotation: [false, false, false] }
    })
  }

  unregisterPhysicsObject(objectId) {
    PhysicsEngine.removeBody(objectId)
  }

  registerScript(scriptName, updateFn) {
    const existing = this.scripts.find(s => s.name === scriptName)
    if (existing) {
      existing.update = updateFn
      existing.enabled = true
    } else {
      this.scripts.push({ name: scriptName, update: updateFn, enabled: true })
    }
  }

  unregisterScript(scriptName) {
    this.scripts = this.scripts.filter(s => s.name !== scriptName)
  }

  emit(event, payload) {
    const listeners = this.events[event] || []
    listeners.forEach(fn => fn(payload))
  }

  on(event, listener) {
    if (!this.events[event]) this.events[event] = []
    this.events[event].push(listener)
  }

  off(event, listener) {
    if (!this.events[event]) return
    this.events[event] = this.events[event].filter(fn => fn !== listener)
  }

  getState() {
    return {
      state: this.state,
      time: this.time,
      objectCount: this.editor.scene.objects.length,
      physicsObjects: this.physicsObjects.length,
      scripts: this.scripts.length
    }
  }
}

class EditorModule {
  constructor() {
    this.name = 'editor'
    this.scene = new Scene()
    this.renderer = null
    this.animationId = null
    this.mainWindow = null
    this.transformMode = 'translate'
    this.playMode = new PlayModeSystem(this)

    this.scene.on('selectionChanged', (obj) => {
      if (this.mainWindow) {
        this.mainWindow.webContents.send('selection-changed', obj ? { id: obj.id, name: obj.name } : null)
      }
    })

    PhysicsEngine.on('collision', (data) => {
      if (this.mainWindow) {
        this.mainWindow.webContents.send('physics-collision', data)
      }
    })

    AudioSystem.on('play', (data) => {
      if (this.mainWindow) {
        this.mainWindow.webContents.send('audio-play', data)
      }
    })
  }

  setMainWindow(win) {
    this.mainWindow = win
  }

  init(canvas) {
    this.renderer = new ThreeRenderer(canvas, this.scene)
    this.renderer.init()
    this.startLoop()
  }

  resize() {
    if (this.renderer) {
      this.renderer.resize()
    }
  }

  startLoop() {
    const loop = () => {
      if (this.renderer && this.renderer.isInitialized) {
        this.scene.objects.forEach(obj => {
          if (obj.visible) {
            this.renderer.updateObject3D(obj)
          }
        })
        this.renderer.updateSelectionGizmo(this.scene.selectedObject)
        this.renderer.render()
      }
      this.animationId = requestAnimationFrame(loop)
    }
    this.animationId = requestAnimationFrame(loop)
  }

  stopLoop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
    if (this.renderer) {
      this.renderer.dispose()
    }
  }

  addCube(name = 'Cube') {
    const obj = new SceneObject(name)
    obj.type = 'cube'
    obj.position.set(Math.random() * 4 - 2, 0.5, Math.random() * 4 - 2)
    obj.components = [
      { type: 'transform', enabled: true },
      { type: 'mesh', enabled: true },
      { type: 'collider', enabled: true }
    ]
    this.scene.add(obj)
    return obj
  }

  addSphere(name = 'Sphere') {
    const obj = new SceneObject(name)
    obj.type = 'sphere'
    obj.position.set(Math.random() * 4 - 2, 0.5, Math.random() * 4 - 2)
    obj.components = [
      { type: 'transform', enabled: true },
      { type: 'mesh', enabled: true },
      { type: 'collider', enabled: true }
    ]
    this.scene.add(obj)
    return obj
  }

  addLight(name = 'Directional Light') {
    const obj = new SceneObject(name)
    obj.type = 'light'
    obj.position.set(5, 8, 5)
    obj.components = [
      { type: 'transform', enabled: true },
      { type: 'light', enabled: true, intensity: 1.0, color: '#ffffff' }
    ]
    this.scene.add(obj)
    return obj
  }

  addMainCamera() {
    const obj = new SceneObject('Main Camera')
    obj.type = 'camera'
    obj.position.set(8, 6, 8)
    obj.components = [
      { type: 'transform', enabled: true },
      { type: 'camera', enabled: true, fov: 60 }
    ]
    this.scene.add(obj)
    return obj
  }

  selectObject(obj) {
    this.scene.select(obj)
  }

  setTransformMode(mode) {
    this.transformMode = mode
  }

  updateObjectProperty(id, property, value) {
    const obj = this.scene.objects.find(o => o.id === id)
    if (!obj) return null
    if (property.startsWith('position.')) {
      const axis = property.split('.')[1]
      obj.position[axis] = parseFloat(value)
    } else if (property.startsWith('rotation.')) {
      const axis = property.split('.')[1]
      obj.rotation[axis] = parseFloat(value)
    } else if (property.startsWith('scale.')) {
      const axis = property.split('.')[1]
      obj.scale[axis] = parseFloat(value)
    } else if (property === 'name') {
      obj.name = value
    } else if (property === 'visible') {
      obj.visible = value
    }
    return obj
  }

  duplicateObject(id) {
    const obj = this.scene.objects.find(o => o.id === id)
    if (!obj) return null
    const newObj = new SceneObject(obj.name + ' (Copy)')
    newObj.type = obj.type
    newObj.position.set(obj.position.x + 1, obj.position.y, obj.position.z + 1)
    newObj.rotation.set(obj.rotation.x, obj.rotation.y, obj.rotation.z)
    newObj.scale.set(obj.scale.x, obj.scale.y, obj.scale.z)
    newObj.visible = obj.visible
    newObj.components = obj.components ? obj.components.map(c => ({ ...c })) : []
    this.scene.add(newObj)
    return newObj
  }

  deleteObject(id) {
    const index = this.scene.objects.findIndex(o => o.id === id)
    if (index === -1) return false
    this.scene.objects.splice(index, 1)
    if (this.scene.selectedObject && this.scene.selectedObject.id === id) {
      this.scene.selectedObject = null
    }
    return true
  }

  moveObject(fromIndex, toIndex) {
    this.scene.moveObject(fromIndex, toIndex)
  }

  saveScene(filePath) {
    try {
      const data = JSON.stringify(this.scene.toJSON(), null, 2)
      if (filePath) {
        require('fs').writeFileSync(filePath, data)
      }
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  loadScene(filePath) {
    try {
      const data = JSON.parse(require('fs').readFileSync(filePath, 'utf-8'))
      this.scene.fromJSON(data)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  addComponent(objectId, componentType) {
    const obj = this.scene.objects.find(o => o.id === objectId)
    if (!obj) return null
    if (!obj.components) obj.components = []
    const existing = obj.components.find(c => c.type === componentType)
    if (existing) return existing
    const component = Components.ComponentFactory.create(componentType)
    obj.components.push(component)
    if (componentType === 'rigidbody') {
      this.playMode.registerPhysicsObject(objectId)
    }
    return component
  }

  removeComponent(objectId, componentType) {
    const obj = this.scene.objects.find(o => o.id === objectId)
    if (!obj || !obj.components) return false
    const index = obj.components.findIndex(c => c.type === componentType)
    if (index === -1) return false
    obj.components.splice(index, 1)
    if (componentType === 'rigidbody') {
      this.playMode.unregisterPhysicsObject(objectId)
    }
    return true
  }

  updateComponentProperty(objectId, componentType, property, value) {
    const obj = this.scene.objects.find(o => o.id === objectId)
    if (!obj || !obj.components) return null
    const component = obj.components.find(c => c.type === componentType)
    if (!component) return null
    if (property.includes('.')) {
      const [parent, child] = property.split('.')
      component[parent][child] = value
    } else {
      component[property] = value
    }
    return component
  }

  getObjectComponents(objectId) {
    const obj = this.scene.objects.find(o => o.id === objectId)
    if (!obj) return []
    return obj.components || []
  }

  getAvailableComponents() {
    return Components.ComponentFactory.getAvailableTypes().map(type => ({
      type,
      ...Components.ComponentFactory.getComponentInfo(type)
    }))
  }

  importAssetToScene(assetId, position = { x: 0, y: 0, z: 0 }) {
    const asset = AssetManager.getAsset(assetId)
    if (!asset) return null
    const obj = new SceneObject(asset.name)
    obj.type = 'imported'
    obj.position.set(position.x, position.y, position.z)
    obj.assetId = asset.id
    obj.assetPath = asset.path
    obj.components = [
      { type: 'transform', enabled: true },
      { type: 'mesh', enabled: true },
      { type: 'collider', enabled: true }
    ]
    this.scene.add(obj)
    return obj
  }

  getIpcHandlers() {
    return {
      'editor-add-cube': async () => {
        const obj = this.addCube()
        return { id: obj.id, name: obj.name }
      },
      'editor-add-sphere': async () => {
        const obj = this.addSphere()
        return { id: obj.id, name: obj.name }
      },
      'editor-add-light': async () => {
        const obj = this.addLight()
        return { id: obj.id, name: obj.name }
      },
      'editor-add-main-camera': async () => {
        const obj = this.addMainCamera()
        return { id: obj.id, name: obj.name }
      },
      'editor-get-scene': async () => {
        return {
          objects: this.scene.objects.map(obj => ({
            id: obj.id,
            name: obj.name,
            type: obj.type,
            position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
            rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
            scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
            visible: obj.visible,
            selected: obj.selected,
            components: obj.components || []
          })),
          selectedId: this.scene.selectedObject ? this.scene.selectedObject.id : null
        }
      },
      'editor-select-object': async (_event, id) => {
        const obj = this.scene.objects.find(o => o.id === id) || null
        this.selectObject(obj)
        return obj ? { id: obj.id, name: obj.name } : null
      },
      'editor-clear-scene': async () => {
        this.scene.objects = []
        this.scene.selectedObject = null
        return { success: true }
      },
      'editor-set-transform-mode': async (_event, mode) => {
        this.setTransformMode(mode)
        return { mode }
      },
      'editor-update-object': async (_event, id, property, value) => {
        const obj = this.updateObjectProperty(id, property, value)
        return obj ? { id: obj.id, name: obj.name } : null
      },
      'editor-duplicate-object': async (_event, id) => {
        const obj = this.duplicateObject(id)
        return obj ? { id: obj.id, name: obj.name } : null
      },
      'editor-delete-object': async (_event, id) => {
        const deleted = this.deleteObject(id)
        return { success: deleted }
      },
      'editor-move-object': async (_event, fromIndex, toIndex) => {
        this.moveObject(fromIndex, toIndex)
        return { success: true }
      },
      'editor-save-scene': async (_event, filePath) => {
        return this.saveScene(filePath)
      },
      'editor-load-scene': async (_event, filePath) => {
        return this.loadScene(filePath)
      },
      'editor-add-component': async (_event, objectId, componentType) => {
        const component = this.addComponent(objectId, componentType)
        return component || null
      },
      'editor-remove-component': async (_event, objectId, componentType) => {
        const removed = this.removeComponent(objectId, componentType)
        return { success: removed }
      },
      'editor-update-component': async (_event, objectId, componentType, property, value) => {
        const component = this.updateComponentProperty(objectId, componentType, property, value)
        return component || null
      },
      'editor-get-components': async (_event, objectId) => {
        return this.getObjectComponents(objectId)
      },
      'editor-get-available-components': async () => {
        return this.getAvailableComponents()
      },
      'editor-import-asset': async (_event, assetId, position) => {
        const obj = this.importAssetToScene(assetId, position)
        return obj ? { id: obj.id, name: obj.name } : null
      },
      'playmode-play': async () => {
        this.playMode.play()
        return { state: 'playing' }
      },
      'playmode-pause': async () => {
        this.playMode.pause()
        return { state: 'paused' }
      },
      'playmode-resume': async () => {
        this.playMode.resume()
        return { state: 'playing' }
      },
      'playmode-stop': async () => {
        this.playMode.stop()
        return { state: 'stopped' }
      },
      'playmode-state': async () => {
        return this.playMode.getState()
      },
      'playmode-register-script': async (_event, scriptName, updateFn) => {
        this.playMode.registerScript(scriptName, updateFn)
        return { success: true }
      },
      'playmode-unregister-script': async (_event, scriptName) => {
        this.playMode.unregisterScript(scriptName)
        return { success: true }
      },
      'playmode-register-physics': async (_event, objectId) => {
        this.playMode.registerPhysicsObject(objectId)
        return { success: true }
      },
      'assets-list': async () => AssetManager.getIpcHandlers()['assets-list'](),
      'assets-list-by-category': async (_event, category) => AssetManager.getIpcHandlers()['assets-list-by-category'](_event, category),
      'assets-search': async (_event, query) => AssetManager.getIpcHandlers()['assets-search'](_event, query),
      'assets-import': async (_event, filePath, category) => AssetManager.getIpcHandlers()['assets-import'](_event, filePath, category),
      'assets-delete': async (_event, assetId) => AssetManager.getIpcHandlers()['assets-delete'](_event, assetId),
      'assets-get': async (_event, assetId) => AssetManager.getIpcHandlers()['assets-get'](_event, assetId)
    }
  }
}

module.exports = new EditorModule()
