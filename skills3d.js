import * as THREE from "three"
import { SVGLoader } from "three/addons/loaders/SVGLoader.js"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"

const FA_BASE = "https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/svgs"
const ACCENT = 0xffb547
const ACCENT_TEXT = 0xffd08a
const SCAN_TOP = 1.3
const SCAN_BOTTOM = -1.3

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))
// Progreso 0→1 de t dentro del tramo [a, b]
const span = (t, a, b) => clamp((t - a) / (b - a), 0, 1)
const easeInOut = (x) => x * x * (3 - 2 * x)
const easeOutBack = (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2)

async function loadIconGeometry(path) {
  const res = await fetch(`${FA_BASE}/${path}.svg`)
  if (!res.ok) throw new Error(`No se pudo cargar el ícono ${path}`)
  const data = new SVGLoader().parse(await res.text())
  const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p))

  const geometry = new THREE.ExtrudeGeometry(shapes, {
    depth: 90,
    curveSegments: 14,
    bevelEnabled: true,
    bevelThickness: 12,
    bevelSize: 7,
    bevelSegments: 4,
  })
  geometry.center()
  geometry.computeBoundingBox()
  const size = new THREE.Vector3()
  geometry.boundingBox.getSize(size)
  return { geometry, scale: 2.3 / Math.max(size.x, size.y) }
}

export function initSkills3D(section) {
  if (!section) return

  const canvas = section.querySelector("#skills-canvas")
  const viewport = section.querySelector(".skills-viewport")
  const scroller = section.querySelector(".skills-scroll")
  const items = [...section.querySelectorAll(".skill-item")]
  const bars = [...section.querySelectorAll(".skills-progress span")]
  const hudName = section.querySelector('[data-hud="name"]')
  const hudScan = section.querySelector('[data-hud="scan"]')
  const hudArc = section.querySelector(".hud-dial-arc")
  const count = items.length

  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  } catch {
    return // Sin WebGL: queda la grilla estática
  }

  section.classList.add("skills-3d")
  section.style.setProperty("--skills-count", count)

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.localClippingEnabled = true
  renderer.toneMapping = THREE.ACESFilmicToneMapping

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)
  camera.position.set(0, 0.9, 7.6)
  camera.lookAt(0, 0, 0)

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.4)
  keyLight.position.set(3, 4, 5)
  const rimLight = new THREE.PointLight(ACCENT, 30, 12)
  rimLight.position.set(-3, 1, -2)
  scene.add(keyLight, rimLight)

  // El escaneo divide al ícono: debajo de la línea es sólido, arriba es wireframe
  const solidPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), SCAN_TOP)
  const wirePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SCAN_TOP)

  const solidMat = new THREE.MeshPhysicalMaterial({
    color: 0xfff4e0,
    metalness: 0.15,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.15,
    clippingPlanes: [solidPlane],
  })
  const wireMat = new THREE.MeshBasicMaterial({
    color: ACCENT_TEXT,
    wireframe: true,
    transparent: true,
    opacity: 0.6,
    clippingPlanes: [wirePlane],
  })
  const ghostMat = new THREE.MeshBasicMaterial({
    color: ACCENT,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    clippingPlanes: [wirePlane],
  })

  const glowMat = (opacity) =>
    new THREE.MeshBasicMaterial({
      color: ACCENT_TEXT,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

  const scanRing = new THREE.Group()
  const ringCore = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.01, 8, 160), glowMat(1))
  const ringHalo = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.04, 8, 160), glowMat(0.1))
  scanRing.add(ringCore, ringHalo)
  scanRing.rotation.x = Math.PI / 2
  scene.add(scanRing)

  const pedestal = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.008, 6, 160), glowMat(0.35))
  pedestal.rotation.x = Math.PI / 2
  pedestal.position.y = -1.35
  scene.add(pedestal)

  const dustGeo = new THREE.BufferGeometry()
  const dust = new Float32Array(180 * 3)
  for (let i = 0; i < dust.length; i += 3) {
    const r = 1.6 + Math.random() * 1.4
    const a = Math.random() * Math.PI * 2
    dust[i] = Math.cos(a) * r
    dust[i + 1] = (Math.random() - 0.5) * 3.4
    dust[i + 2] = Math.sin(a) * r
  }
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dust, 3))
  const dustPoints = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: ACCENT_TEXT, size: 0.025, transparent: true, opacity: 0.55, depthWrite: false })
  )
  scene.add(dustPoints)

  // Un grupo por habilidad; solo se muestra el activo
  const models = items.map(() => {
    const pivot = new THREE.Group()
    pivot.visible = false
    scene.add(pivot)
    return pivot
  })

  items.forEach((item, i) => {
    loadIconGeometry(item.dataset.icon)
      .then(({ geometry, scale }) => {
        const inner = new THREE.Group()
        // Y negativa: el SVG tiene el eje Y hacia abajo
        inner.scale.set(scale, -scale, scale)
        inner.add(
          new THREE.Mesh(geometry, solidMat),
          new THREE.Mesh(geometry, ghostMat),
          new THREE.Mesh(geometry, wireMat)
        )
        models[i].add(inner)
      })
      .catch((err) => console.warn(err))
  })

  const resize = () => {
    const { width, height } = viewport.getBoundingClientRect()
    if (!width || !height) return
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  new ResizeObserver(resize).observe(viewport)
  resize()

  const scrollTarget = () => {
    const rect = scroller.getBoundingClientRect()
    const total = rect.height - window.innerHeight
    return total > 0 ? clamp(-rect.top / total, 0, 1) : 0
  }

  let progress = scrollTarget()
  let activeIndex = -1
  let running = false
  let rafId
  const clock = new THREE.Clock()

  const setActive = (index) => {
    if (index === activeIndex) return
    activeIndex = index
    items.forEach((item, i) => item.classList.toggle("is-active", i === index))
    bars.forEach((bar, i) => bar.classList.toggle("is-done", i <= index))
    models.forEach((model, i) => (model.visible = i === index))
    hudName.textContent = items[index].querySelector("h3").textContent
  }

  const frame = () => {
    const time = clock.getElapsedTime()
    progress += (scrollTarget() - progress) * 0.12

    const f = progress * count
    const index = Math.min(count - 1, Math.floor(f))
    const t = f - index
    setActive(index)

    // Línea de tiempo de cada habilidad:
    // entra → sólido → escanea hacia abajo (wireframe) → escanea hacia arriba (sólido) → sale
    const enter = index === 0 ? 1 : easeOutBack(span(t, 0, 0.12))
    const exit = index === count - 1 ? 0 : easeInOut(span(t, 0.88, 1))
    const scale = Math.max(0.0001, enter * (1 - exit))

    const down = easeInOut(span(t, 0.18, 0.48))
    const up = easeInOut(span(t, 0.6, 0.84))
    const scanY = SCAN_TOP + (SCAN_BOTTOM - SCAN_TOP) * (down - up)
    solidPlane.constant = scanY
    wirePlane.constant = -scanY

    const scanning = (t > 0.16 && t < 0.5) || (t > 0.58 && t < 0.86)
    scanRing.position.y = scanY
    scanRing.scale.setScalar(scale)
    ringCore.material.opacity += ((scanning ? 1 : 0) - ringCore.material.opacity) * 0.15
    ringHalo.material.opacity = ringCore.material.opacity * 0.1

    const model = models[index]
    model.scale.setScalar(scale)
    // Balanceo de lado a lado: nunca queda de canto, así siempre se lee el logo
    model.rotation.y = Math.sin(t * Math.PI * 2) * 0.75 + Math.sin(time * 0.6) * 0.08
    model.rotation.x = Math.sin(time * 0.8) * 0.06
    model.position.y = Math.sin(time * 1.1) * 0.05

    dustPoints.rotation.y = time * 0.05 + progress * 2

    const scanPct = Math.round(span(t, 0.12, 0.86) * 100)
    hudScan.textContent = `${scanPct}%`
    hudArc.style.strokeDasharray = `${(progress * 100).toFixed(1)} 100`

    renderer.render(scene, camera)
    if (running) rafId = requestAnimationFrame(frame)
  }

  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !running) {
      running = true
      rafId = requestAnimationFrame(frame)
    } else if (!entry.isIntersecting && running) {
      running = false
      cancelAnimationFrame(rafId)
    }
  }).observe(section)

  setActive(0)
}
