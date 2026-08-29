class EventEmitter {
  constructor() {
    this._events = {}
  }
  on(event, listener) {
    if (!this._events[event]) this._events[event] = []
    this._events[event].push(listener)
  }
  off(event, listener) {
    if (!this._events[event]) return
    this._events[event] = this._events[event].filter(fn => fn !== listener)
  }
  emit(event, payload) {
    if (!this._events[event]) return
    this._events[event].forEach(fn => fn(payload))
  }
}

class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x
    this.y = y
    this.z = z
  }
  set(x, y, z) {
    this.x = x
    this.y = y
    this.z = z
    return this
  }
  clone() {
    return new Vector3(this.x, this.y, this.z)
  }
}

class Camera {
  constructor() {
    this.position = new Vector3(8, 6, 8)
    this.target = new Vector3(0, 0, 0)
    this.up = new Vector3(0, 1, 0)
    this.fov = 60
    this.near = 0.1
    this.far = 1000
  }
}

class SceneObject {
  constructor(name = 'Object') {
    this.id = Math.random().toString(36).slice(2, 9)
    this.name = name
    this.position = new Vector3()
    this.rotation = new Vector3()
    this.scale = new Vector3(1, 1, 1)
    this.visible = true
    this.selected = false
  }
}

class Scene extends EventEmitter {
  constructor() {
    super()
    this.objects = []
    this.selectedObject = null
    this.camera = new Camera()
  }

  add(object) {
    this.objects.push(object)
    this.emit('objectAdded', object)
  }

  remove(object) {
    this.objects = this.objects.filter(obj => obj !== object)
    if (this.selectedObject === object) {
      this.selectedObject = null
    }
    this.emit('objectRemoved', object)
  }

  select(object) {
    if (this.selectedObject) {
      this.selectedObject.selected = false
    }
    this.selectedObject = object
    if (object) {
      object.selected = true
      this.emit('selectionChanged', object)
    } else {
      this.emit('selectionChanged', null)
    }
  }

  moveObject(objectIndex, newIndex) {
    if (objectIndex === newIndex) return
    const object = this.objects[objectIndex]
    this.objects.splice(objectIndex, 1)
    this.objects.splice(newIndex, 0, object)
    this.emit('objectsReordered')
  }

  findByPosition(x, y, z, tolerance = 0.5) {
    return this.objects.find(obj => {
      return Math.abs(obj.position.x - x) <= tolerance &&
             Math.abs(obj.position.y - y) <= tolerance &&
             Math.abs(obj.position.z - z) <= tolerance
    }) || null
  }

  toJSON() {
    return {
      objects: this.objects.map(obj => ({
        name: obj.name,
        type: obj.type,
        position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
        rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
        scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
        visible: obj.visible,
        components: obj.components || []
      }))
    }
  }

  fromJSON(data) {
    this.objects = []
    this.selectedObject = null
    if (!data || !Array.isArray(data.objects)) return
    data.objects.forEach(objData => {
      const obj = new SceneObject(objData.name)
      obj.type = objData.type
      obj.position.set(objData.position.x, objData.position.y, objData.position.z)
      obj.rotation.set(objData.rotation.x, objData.rotation.y, objData.rotation.z)
      obj.scale.set(objData.scale.x, objData.scale.y, objData.scale.z)
      obj.visible = objData.visible
      obj.components = objData.components || []
      this.objects.push(obj)
    })
    this.emit('objectsReordered')
  }
}

module.exports = {
  Scene,
  SceneObject,
  Camera,
  Vector3,
  EventEmitter
}
