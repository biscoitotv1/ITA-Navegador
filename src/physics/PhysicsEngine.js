const EventEmitter = require('events')

class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x
    this.y = y
    this.z = z
  }

  add(v) { return new Vector3(this.x + v.x, this.y + v.y, this.z + v.z) }
  sub(v) { return new Vector3(this.x - v.x, this.y - v.y, this.z - v.z) }
  mul(s) { return new Vector3(this.x * s, this.y * s, this.z * s) }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z }
  cross(v) { return new Vector3(this.y * v.z - this.z * v.y, this.z * v.x - this.x * v.z, this.x * v.y - this.y * v.x) }
  length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z) }
  normalize() { const l = this.length(); return l > 0 ? this.mul(1 / l) : new Vector3() }
  clone() { return new Vector3(this.x, this.y, this.z) }
}

class PhysicsBody {
  constructor(objectId, config = {}) {
    this.objectId = objectId
    this.position = new Vector3(config.x || 0, config.y || 0, config.z || 0)
    this.velocity = new Vector3(config.vx || 0, config.vy || 0, config.vz || 0)
    this.angularVelocity = new Vector3(config.ax || 0, config.ay || 0, config.az || 0)
    this.mass = config.mass || 1
    this.drag = config.drag || 0.1
    this.angularDrag = config.angularDrag || 0.1
    this.useGravity = config.useGravity !== false
    this.isKinematic = config.isKinematic || false
    this.isTrigger = config.isTrigger || false
    this.colliderShape = config.shape || 'box'
    this.size = new Vector3(config.width || 1, config.height || 1, config.depth || 1)
    this.center = new Vector3(config.cx || 0, config.cy || 0, config.cz || 0)
    this.friction = config.friction || 0.5
    this.restitution = config.restitution || 0.3
    this.constraints = config.constraints || { freezePosition: [false, false, false], freezeRotation: [false, false, false] }
    this.groundFriction = config.groundFriction || 0.8
    this.gravityScale = config.gravityScale || 1
    this.forces = []
    this.collidingWith = new Set()
  }

  applyForce(force) {
    if (this.isKinematic) return
    this.forces.push(force)
  }

  applyImpulse(impulse) {
    if (this.isKinematic) return
    this.velocity = this.velocity.add(impulse.mul(1 / this.mass))
  }

  clearForces() {
    this.forces = []
  }

  getBounds() {
    const halfSize = this.size.mul(0.5)
    const min = this.position.sub(this.center).sub(halfSize)
    const max = this.position.sub(this.center).add(halfSize)
    return { min, max }
  }
}

class CollisionManifold {
  constructor(bodyA, bodyB, normal, depth, contactPoint) {
    this.bodyA = bodyA
    this.bodyB = bodyB
    this.normal = normal
    this.depth = depth
    this.contactPoint = contactPoint
  }
}

class PhysicsEngine extends EventEmitter {
  constructor() {
    super()
    this.bodies = new Map()
    this.gravity = new Vector3(0, -9.81, 0)
    this.groundY = 0
    this.maxSubSteps = 8
    this.fixedTimeStep = 1 / 60
    this.accumulator = 0
    this.running = false
    this.collisionCallbacks = new Map()
  }

  addBody(objectId, config = {}) {
    const body = new PhysicsBody(objectId, config)
    this.bodies.set(objectId, body)
    this.emit('bodyAdded', { objectId, body })
    return body
  }

  removeBody(objectId) {
    const body = this.bodies.get(objectId)
    if (body) {
      this.bodies.delete(objectId)
      this.emit('bodyRemoved', { objectId })
    }
  }

  getBody(objectId) {
    return this.bodies.get(objectId) || null
  }

  update(dt) {
    if (!this.running) return

    this.accumulator += dt
    let steps = 0

    while (this.accumulator >= this.fixedTimeStep && steps < this.maxSubSteps) {
      this.step(this.fixedTimeStep)
      this.accumulator -= this.fixedTimeStep
      steps++
    }
  }

  step(dt) {
    for (const [id, body] of this.bodies) {
      if (body.isKinematic) continue
      this.integrateForces(body, dt)
    }

    const manifolds = this.detectCollisions()
    for (const manifold of manifolds) {
      this.resolveCollision(manifold)
      this.emitCollision(manifold)
    }

    for (const [id, body] of this.bodies) {
      if (body.isKinematic) continue
      this.integrateVelocities(body, dt)
      this.applyConstraints(body)
    }
  }

  integrateForces(body, dt) {
    if (!body.useGravity) return
    const gravityForce = this.gravity.mul(body.gravityScale * body.mass)
    body.forces.push(gravityForce)

    const totalForce = body.forces.reduce((acc, force) => acc.add(force), new Vector3())
    body.velocity = body.velocity.add(totalForce.mul(dt / body.mass))
    body.clearForces()
  }

  integrateVelocities(body, dt) {
    body.position = body.position.add(body.velocity.mul(dt))
    body.angularVelocity = body.angularVelocity.mul(1 - body.angularDrag * dt)
  }

  applyConstraints(body) {
    if (body.constraints.freezePosition[0]) body.velocity.x = 0
    if (body.constraints.freezePosition[1]) body.velocity.y = 0
    if (body.constraints.freezePosition[2]) body.velocity.z = 0
    if (body.constraints.freezeRotation[0]) body.angularVelocity.x = 0
    if (body.constraints.freezeRotation[1]) body.angularVelocity.y = 0
    if (body.constraints.freezeRotation[2]) body.angularVelocity.z = 0
  }

  detectCollisions() {
    const manifolds = []
    const bodiesArray = Array.from(this.bodies.values())

    for (let i = 0; i < bodiesArray.length; i++) {
      for (let j = i + 1; j < bodiesArray.length; j++) {
        const bodyA = bodiesArray[i]
        const bodyB = bodiesArray[j]

        if (bodyA.isTrigger && bodyB.isTrigger) continue

        const manifold = this.testCollision(bodyA, bodyB)
        if (manifold) {
          manifolds.push(manifold)
        }
      }
    }

    return manifolds
  }

  testCollision(bodyA, bodyB) {
    const boundsA = bodyA.getBounds()
    const boundsB = bodyB.getBounds()

    const overlapX = Math.min(boundsA.max.x - boundsB.min.x, boundsB.max.x - boundsA.min.x)
    const overlapY = Math.min(boundsA.max.y - boundsB.min.y, boundsB.max.y - boundsA.min.y)
    const overlapZ = Math.min(boundsA.max.z - boundsB.min.z, boundsB.max.z - boundsA.min.z)

    if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) {
      return null
    }

    const normal = this.calculateCollisionNormal(bodyA, bodyB, overlapX, overlapY, overlapZ)
    const depth = Math.min(overlapX, overlapY, overlapZ)
    const contactPoint = bodyA.position.add(bodyB.position).mul(0.5)

    return new CollisionManifold(bodyA, bodyB, normal, depth, contactPoint)
  }

  calculateCollisionNormal(bodyA, bodyB, overlapX, overlapY, overlapZ) {
    const posA = bodyA.position
    const posB = bodyB.position
    const dx = posB.x - posA.x
    const dy = posB.y - posA.y
    const dz = posB.z - posA.z

    if (overlapX < overlapY && overlapX < overlapZ) {
      return new Vector3(dx > 0 ? 1 : -1, 0, 0)
    } else if (overlapY < overlapZ) {
      return new Vector3(0, dy > 0 ? 1 : -1, 0)
    } else {
      return new Vector3(0, 0, dz > 0 ? 1 : -1)
    }
  }

  resolveCollision(manifold) {
    const { bodyA, bodyB, normal, depth } = manifold

    if (bodyA.isTrigger || bodyB.isTrigger) {
      this.emit('trigger', { bodyA: bodyA.objectId, bodyB: bodyB.objectId })
      return
    }

    if (bodyA.isKinematic && bodyB.isKinematic) return

    const totalMass = bodyA.mass + bodyB.mass
    const ratioA = bodyA.isKinematic ? 0 : bodyB.mass / totalMass
    const ratioB = bodyB.isKinematic ? 0 : bodyA.mass / totalMass

    const correction = normal.mul(depth * 0.8)
    bodyA.position = bodyA.position.sub(correction.mul(ratioA))
    bodyB.position = bodyB.position.add(correction.mul(ratioB))

    const relativeVelocity = bodyB.velocity.sub(bodyA.velocity)
    const velocityAlongNormal = relativeVelocity.dot(normal)

    if (velocityAlongNormal > 0) return

    const restitution = Math.min(bodyA.restitution, bodyB.restitution)
    const friction = Math.sqrt(bodyA.friction * bodyB.friction)

    const j = -(1 + restitution) * velocityAlongNormal
    const impulseMagnitude = j / (1 / bodyA.mass + 1 / bodyB.mass)
    const impulse = normal.mul(impulseMagnitude)

    if (!bodyA.isKinematic) {
      bodyA.velocity = bodyA.velocity.sub(impulse.mul(1 / bodyA.mass))
      bodyA.velocity.x *= (1 - bodyA.drag * 0.1)
      bodyA.velocity.z *= (1 - bodyA.groundFriction * 0.1)
    }

    if (!bodyB.isKinematic) {
      bodyB.velocity = bodyB.velocity.add(impulse.mul(1 / bodyB.mass))
      bodyB.velocity.x *= (1 - bodyB.drag * 0.1)
      bodyB.velocity.z *= (1 - bodyB.groundFriction * 0.1)
    }
  }

  emitCollision(manifold) {
    const callbackKey = `${manifold.bodyA.objectId}-${manifold.bodyB.objectId}`
    const callbackKeyReverse = `${manifold.bodyB.objectId}-${manifold.bodyA.objectId}`

    const callback = this.collisionCallbacks.get(callbackKey) || this.collisionCallbacks.get(callbackKeyReverse)
    if (callback) {
      callback({
        bodyA: manifold.bodyA.objectId,
        bodyB: manifold.bodyB.objectId,
        normal: { x: manifold.normal.x, y: manifold.normal.y, z: manifold.normal.z },
        depth: manifold.depth
      })
    }

    this.emit('collision', {
      bodyA: manifold.bodyA.objectId,
      bodyB: manifold.bodyB.objectId,
      normal: { x: manifold.normal.x, y: manifold.normal.y, z: manifold.normal.z },
      depth: manifold.depth
    })
  }

  onCollision(objectIdA, objectIdB, callback) {
    const key = `${objectIdA}-${objectIdB}`
    this.collisionCallbacks.set(key, callback)
  }

  removeCollisionCallback(objectIdA, objectIdB) {
    const key = `${objectIdA}-${objectIdB}`
    this.collisionCallbacks.delete(key)
  }

  raycast(origin, direction, maxDistance = 100) {
    const dir = direction.normalize()
    let closestHit = null
    let closestDistance = maxDistance

    for (const [id, body] of this.bodies) {
      const hit = this.raycastBody(origin, dir, body, closestDistance)
      if (hit && hit.distance < closestDistance) {
        closestDistance = hit.distance
        closestHit = { objectId: id, ...hit }
      }
    }

    return closestHit
  }

  raycastBody(origin, direction, body, maxDistance) {
    const bounds = body.getBounds()
    let tmin = -Infinity
    let tmax = Infinity

    if (direction.x !== 0) {
      const tx1 = (bounds.min.x - origin.x) / direction.x
      const tx2 = (bounds.max.x - origin.x) / direction.x
      tmin = Math.max(tmin, Math.min(tx1, tx2))
      tmax = Math.min(tmax, Math.max(tx1, tx2))
      if (tmin > tmax) return null
    }

    if (direction.y !== 0) {
      const ty1 = (bounds.min.y - origin.y) / direction.y
      const ty2 = (bounds.max.y - origin.y) / direction.y
      tmin = Math.max(tmin, Math.min(ty1, ty2))
      tmax = Math.min(tmax, Math.max(ty1, ty2))
      if (tmin > tmax) return null
    }

    if (direction.z !== 0) {
      const tz1 = (bounds.min.z - origin.z) / direction.z
      const tz2 = (bounds.max.z - origin.z) / direction.z
      tmin = Math.max(tmin, Math.min(tz1, tz2))
      tmax = Math.min(tmax, Math.max(tz1, tz2))
      if (tmin > tmax) return null
    }

    if (tmin < 0 && tmax < 0) return null
    const distance = tmin > 0 ? tmin : tmax
    if (distance > maxDistance || distance < 0) return null

    const point = origin.add(direction.mul(distance))
    const normal = direction.mul(-1)

    return { distance, point: { x: point.x, y: point.y, z: point.z }, normal: { x: normal.x, y: normal.y, z: normal.z } }
  }

  setGravity(x, y, z) {
    this.gravity = new Vector3(x, y, z)
  }

  setGroundY(y) {
    this.groundY = y
  }

  start() {
    this.running = true
    this.accumulator = 0
    this.emit('started')
  }

  stop() {
    this.running = false
    this.emit('stopped')
  }

  clear() {
    this.bodies.clear()
    this.collisionCallbacks.clear()
  }

  getIpcHandlers() {
    return {
      'physics-add-body': async (_event, objectId, config) => this.addBody(objectId, config),
      'physics-remove-body': async (_event, objectId) => this.removeBody(objectId),
      'physics-get-body': async (_event, objectId) => this.getBody(objectId),
      'physics-set-gravity': async (_event, x, y, z) => { this.setGravity(x, y, z); return { x, y, z } },
      'physics-set-ground': async (_event, y) => { this.setGroundY(y); return { y } },
      'physics-raycast': async (_event, origin, direction, maxDistance) => this.raycast(origin, direction, maxDistance),
      'physics-on-collision': async (_event, bodyA, bodyB, callback) => this.onCollision(bodyA, bodyB, callback),
      'physics-start': async () => this.start(),
      'physics-stop': async () => this.stop(),
      'physics-clear': async () => this.clear()
    }
  }
}

module.exports = new PhysicsEngine()
