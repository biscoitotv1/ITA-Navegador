class Component {
  constructor(type, enabled = true) {
    this.type = type
    this.enabled = enabled
    this.id = Math.random().toString(36).slice(2, 9)
  }
}

class TransformComponent extends Component {
  constructor() {
    super('transform', true)
    this.position = { x: 0, y: 0, z: 0 }
    this.rotation = { x: 0, y: 0, z: 0 }
    this.scale = { x: 1, y: 1, z: 1 }
  }
}

class MeshComponent extends Component {
  constructor(meshType = 'cube') {
    super('mesh', true)
    this.meshType = meshType
    this.material = 'default'
    this.castShadow = true
    this.receiveShadow = true
  }
}

class ColliderComponent extends Component {
  constructor(shape = 'box') {
    super('collider', true)
    this.shape = shape
    this.isTrigger = false
    this.center = { x: 0, y: 0, z: 0 }
    this.size = { x: 1, y: 1, z: 1 }
  }
}

class RigidBodyComponent extends Component {
  constructor() {
    super('rigidbody', false)
    this.mass = 1
    this.drag = 0.1
    this.angularDrag = 0.1
    this.useGravity = true
    this.isKinematic = false
    this.constraints = {
      freezePositionX: false,
      freezePositionY: false,
      freezePositionZ: false,
      freezeRotationX: false,
      freezeRotationY: false,
      freezeRotationZ: false
    }
  }
}

class LightComponent extends Component {
  constructor(type = 'directional') {
    super('light', true)
    this.lightType = type
    this.color = '#ffffff'
    this.intensity = 1
    this.range = 10
    this.spotAngle = 30
    this.castShadow = true
  }
}

class CameraComponent extends Component {
  constructor() {
    super('camera', true)
    this.fov = 60
    this.near = 0.1
    this.far = 1000
    this.backgroundColor = '#000000'
    this.cullingMask = 'everything'
  }
}

class AudioSourceComponent extends Component {
  constructor() {
    super('audioSource', false)
    this.clip = null
    this.volume = 1
    this.loop = false
    this.playOnAwake = false
    this.spatialBlend = 0
  }
}

class AudioListenerComponent extends Component {
  constructor() {
    super('audioListener', false)
  }
}

class ScriptComponent extends Component {
  constructor(scriptName = '') {
    super('script', false)
    this.scriptName = scriptName
    this.parameters = {}
    this.enabled = false
  }
}

class ParticleSystemComponent extends Component {
  constructor() {
    super('particleSystem', false)
    this.maxParticles = 100
    this.duration = 5
    this.loop = true
    this.startLifetime = 1
    this.startSpeed = 1
    this.startSize = 0.1
    this.startColor = '#ffffff'
    this.gravityModifier = 0
    this.emissionRate = 10
  }
}

class AnimationComponent extends Component {
  constructor() {
    super('animation', false)
    this.animator = null
    this.clip = null
    this.playOnAwake = false
    this.speed = 1
    this.loop = true
  }
}

class ComponentFactory {
  static create(type, ...args) {
    switch (type) {
      case 'transform':
        return new TransformComponent(...args)
      case 'mesh':
        return new MeshComponent(...args)
      case 'collider':
        return new ColliderComponent(...args)
      case 'rigidbody':
        return new RigidBodyComponent(...args)
      case 'light':
        return new LightComponent(...args)
      case 'camera':
        return new CameraComponent(...args)
      case 'audioSource':
        return new AudioSourceComponent(...args)
      case 'audioListener':
        return new AudioListenerComponent(...args)
      case 'script':
        return new ScriptComponent(...args)
      case 'particleSystem':
        return new ParticleSystemComponent(...args)
      case 'animation':
        return new AnimationComponent(...args)
      default:
        return new Component(type, ...args)
    }
  }

  static getAvailableTypes() {
    return [
      'transform', 'mesh', 'collider', 'rigidbody', 'light',
      'camera', 'audioSource', 'audioListener', 'script',
      'particleSystem', 'animation'
    ]
  }

  static getComponentInfo(type) {
    const info = {
      transform: { name: 'Transform', description: 'Posição, rotação e escala do objeto', icon: '↕️' },
      mesh: { name: 'Mesh Renderer', description: 'Renderiza malhas 3D', icon: '🟫' },
      collider: { name: 'Collider', description: 'Detecta colisões', icon: '⬜' },
      rigidbody: { name: 'Rigid Body', description: 'Física do objeto', icon: '⚖️' },
      light: { name: 'Light', description: 'Iluminação da cena', icon: '💡' },
      camera: { name: 'Camera', description: 'Câmera de visualização', icon: '📷' },
      audioSource: { name: 'Audio Source', description: 'Reproduz áudio', icon: '🔊' },
      audioListener: { name: 'Audio Listener', description: 'Recebe áudio', icon: '👂' },
      script: { name: 'Script', description: 'Executa código customizado', icon: '📜' },
      particleSystem: { name: 'Particle System', description: 'Sistema de partículas', icon: '✨' },
      animation: { name: 'Animator', description: 'Animações do objeto', icon: '🎬' }
    }
    return info[type] || { name: type, description: 'Componente desconhecido', icon: '❓' }
  }
}

module.exports = {
  Component,
  TransformComponent,
  MeshComponent,
  ColliderComponent,
  RigidBodyComponent,
  LightComponent,
  CameraComponent,
  AudioSourceComponent,
  AudioListenerComponent,
  ScriptComponent,
  ParticleSystemComponent,
  AnimationComponent,
  ComponentFactory
}
