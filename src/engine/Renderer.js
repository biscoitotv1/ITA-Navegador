const { Scene, SceneObject, Camera, Vector3 } = require('./Scene')

class Renderer {
  constructor(canvas, scene) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.scene = scene
    this.width = canvas.width
    this.height = canvas.height
    this.camera = scene.camera

    this.gridSize = 20
    this.gridStep = 1
    this.rotationY = 0
    this.panX = 0
    this.panY = 0
    this.zoom = 1
    this.transformMode = 'translate'

    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e))
    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e))
    canvas.addEventListener('mouseup', (e) => this.onMouseUp(e))
    canvas.addEventListener('wheel', (e) => this.onWheel(e))
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())

    this.isDragging = false
    this.isPanning = false
    this.lastMouseX = 0
    this.lastMouseY = 0
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect()
    this.canvas.width = rect.width
    this.canvas.height = rect.height
    this.width = this.canvas.width
    this.height = this.canvas.height
  }

  project(x, y, z) {
    const cx = this.width / 2 + this.panX
    const cy = this.height / 2 + this.panY
    const scale = Math.min(this.width, this.height) * 0.1 * this.zoom

    const cos = Math.cos(this.rotationY)
    const sin = Math.sin(this.rotationY)
    const rx = x * cos - z * sin
    const rz = x * sin + z * cos

    const perspective = 4 / (4 + rz * 0.1)
    const sx = cx + rx * scale * perspective
    const sy = cy - y * scale * perspective
    return { x: sx, y: sy, scale: perspective }
  }

  drawGrid() {
    const ctx = this.ctx
    const size = this.gridSize
    const step = this.gridStep

    ctx.strokeStyle = '#1f1f1f'
    ctx.lineWidth = 1

    for (let i = -size; i <= size; i += step) {
      const start = this.project(i, 0, -size)
      const end = this.project(i, 0, size)
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.stroke()

      const start2 = this.project(-size, 0, i)
      const end2 = this.project(size, 0, i)
      ctx.beginPath()
      ctx.moveTo(start2.x, start2.y)
      ctx.lineTo(end2.x, end2.y)
      ctx.stroke()
    }
  }

  drawAxes() {
    const ctx = this.ctx
    const origin = this.project(0, 0, 0)
    const len = 3

    const x = this.project(len, 0, 0)
    const y = this.project(0, len, 0)
    const z = this.project(0, 0, len)

    ctx.lineWidth = 2
    ctx.strokeStyle = '#ef4444'
    ctx.beginPath()
    ctx.moveTo(origin.x, origin.y)
    ctx.lineTo(x.x, x.y)
    ctx.stroke()

    ctx.strokeStyle = '#22c55e'
    ctx.beginPath()
    ctx.moveTo(origin.x, origin.y)
    ctx.lineTo(y.x, y.y)
    ctx.stroke()

    ctx.strokeStyle = '#3b82f6'
    ctx.beginPath()
    ctx.moveTo(origin.x, origin.y)
    ctx.lineTo(z.x, z.y)
    ctx.stroke()
  }

  drawCube(obj) {
    const ctx = this.ctx
    const size = 1
    const hw = size / 2

    const vertices = [
      new Vector3(obj.position.x - hw, obj.position.y, obj.position.z - hw),
      new Vector3(obj.position.x + hw, obj.position.y, obj.position.z - hw),
      new Vector3(obj.position.x + hw, obj.position.y, obj.position.z + hw),
      new Vector3(obj.position.x - hw, obj.position.y, obj.position.z + hw),
      new Vector3(obj.position.x - hw, obj.position.y + size, obj.position.z - hw),
      new Vector3(obj.position.x + hw, obj.position.y + size, obj.position.z - hw),
      new Vector3(obj.position.x + hw, obj.position.y + size, obj.position.z + hw),
      new Vector3(obj.position.x - hw, obj.position.y + size, obj.position.z + hw)
    ]

    const projected = vertices.map(v => this.project(v.x, v.y, v.z))

    ctx.strokeStyle = obj.selected ? '#2a5298' : '#d4d4d4'
    ctx.lineWidth = obj.selected ? 2 : 1
    ctx.fillStyle = obj.selected ? 'rgba(42, 82, 152, 0.2)' : 'rgba(0, 0, 0, 0.2)'

    const faces = [
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [2, 3, 7, 6],
      [0, 3, 7, 4],
      [1, 2, 6, 5]
    ]

    faces.forEach(face => {
      ctx.beginPath()
      ctx.moveTo(projected[face[0]].x, projected[face[0]].y)
      ctx.lineTo(projected[face[1]].x, projected[face[1]].y)
      ctx.lineTo(projected[face[2]].x, projected[face[2]].y)
      ctx.lineTo(projected[face[3]].x, projected[face[3]].y)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    })
  }

  drawSphere(obj) {
    const ctx = this.ctx
    const center = this.project(obj.position.x, obj.position.y + 0.5, obj.position.z)
    const radius = 20 * this.zoom

    ctx.strokeStyle = obj.selected ? '#2a5298' : '#d4d4d4'
    ctx.lineWidth = obj.selected ? 2 : 1
    ctx.fillStyle = obj.selected ? 'rgba(42, 82, 152, 0.2)' : 'rgba(0, 0, 0, 0.2)'
    ctx.beginPath()
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }

  drawLight(obj) {
    const ctx = this.ctx
    const center = this.project(obj.position.x, obj.position.y + 0.2, obj.position.z)
    const size = 12 * this.zoom

    ctx.fillStyle = obj.selected ? '#facc15' : '#facc15'
    ctx.strokeStyle = obj.selected ? '#facc15' : '#a16207'
    ctx.lineWidth = obj.selected ? 2 : 1
    ctx.beginPath()
    ctx.moveTo(center.x, center.y - size)
    ctx.lineTo(center.x + size * 0.8, center.y + size * 0.6)
    ctx.lineTo(center.x - size * 0.8, center.y + size * 0.6)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }

  drawGizmo(obj) {
    if (!obj || !obj.selected) return
    const ctx = this.ctx
    const pos = this.project(obj.position.x, obj.position.y + 1.2, obj.position.z)

    if (this.transformMode === 'translate') {
      const arrowSize = 15 * this.zoom
      ctx.lineWidth = 2

      ctx.strokeStyle = '#ef4444'
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
      ctx.lineTo(pos.x, pos.y - arrowSize)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y - arrowSize)
      ctx.lineTo(pos.x - 4, pos.y - arrowSize + 6)
      ctx.lineTo(pos.x + 4, pos.y - arrowSize + 6)
      ctx.closePath()
      ctx.fillStyle = '#ef4444'
      ctx.fill()

      ctx.strokeStyle = '#22c55e'
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
      ctx.lineTo(pos.x - arrowSize * 0.7, pos.y - arrowSize * 0.7)
      ctx.stroke()

      ctx.strokeStyle = '#3b82f6'
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
      ctx.lineTo(pos.x + arrowSize * 0.7, pos.y - arrowSize * 0.7)
      ctx.stroke()
    } else if (this.transformMode === 'rotate') {
      ctx.strokeStyle = '#2a5298'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, 18 * this.zoom, 0, Math.PI * 2)
      ctx.stroke()
    } else if (this.transformMode === 'scale') {
      const size = 6 * this.zoom
      ctx.strokeStyle = '#f97316'
      ctx.lineWidth = 2
      ctx.strokeRect(pos.x - size, pos.y - size, size * 2, size * 2)
    }
  }

  drawObject(obj) {
    if (!obj.visible) return
    if (obj.type === 'cube') {
      this.drawCube(obj)
    } else if (obj.type === 'sphere') {
      this.drawSphere(obj)
    } else if (obj.type === 'light') {
      this.drawLight(obj)
    }
    this.drawGizmo(obj)
  }

  render() {
    const ctx = this.ctx
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, this.width, this.height)

    this.drawGrid()
    this.drawAxes()

    this.scene.objects.forEach(obj => this.drawObject(obj))

    ctx.fillStyle = '#9aa3b2'
    ctx.font = '11px Consolas'
    ctx.fillText(`Objects: ${this.scene.objects.length}`, 10, 20)
    if (this.scene.selectedObject) {
      ctx.fillText(`Selected: ${this.scene.selectedObject.name}`, 10, 36)
    }
    ctx.fillText(`Mode: ${this.transformMode}`, 10, 52)
  }

  onMouseDown(e) {
    if (e.button === 0 && !e.shiftKey) {
      const rect = this.canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const clicked = this.pickObject(mx, my)
      if (clicked && this.scene) {
        this.scene.select(clicked)
      } else if (this.scene) {
        this.scene.select(null)
      }
    }
    this.isDragging = true
    this.isPanning = e.button === 2 || e.shiftKey
    this.lastMouseX = e.clientX
    this.lastMouseY = e.clientY
  }

  pickObject(mx, my) {
    const threshold = 20
    const candidates = [...this.scene.objects].reverse()
    for (const obj of candidates) {
      if (!obj.visible) continue
      const projected = this.project(obj.position.x, obj.position.y + (obj.type === 'sphere' ? 0.5 : 0.5), obj.position.z)
      const dist = Math.sqrt((mx - projected.x) ** 2 + (my - projected.y) ** 2)
      if (dist < threshold) {
        return obj
      }
    }
    return null
  }

  onMouseMove(e) {
    if (!this.isDragging) return
    const dx = e.clientX - this.lastMouseX
    const dy = e.clientY - this.lastMouseY

    if (this.isPanning) {
      this.panX += dx
      this.panY += dy
    } else {
      this.rotationY += dx * 0.01
    }

    this.lastMouseX = e.clientX
    this.lastMouseY = e.clientY
  }

  onMouseUp(e) {
    this.isDragging = false
    this.isPanning = false
  }

  onWheel(e) {
    e.preventDefault()
    this.zoom += e.deltaY * -0.001
    this.zoom = Math.max(0.1, Math.min(10, this.zoom))
  }
}

module.exports = { Renderer }
