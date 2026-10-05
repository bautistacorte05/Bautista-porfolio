import * as THREE from "three"
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"

const ACCENT = 0xffb547
const ACCENT_TEXT = 0xffd08a

// Capturas 1200x693: la pantalla respeta esa proporción
const SHOT_ASPECT = 1200 / 693
const SCREEN_W = 3.0
const SCREEN_H = SCREEN_W / SHOT_ASPECT
const BEZEL_BOTTOM = 0.17
const BEZEL_TOP = 0.13
const LID_W = 3.3
const LID_H = SCREEN_H + BEZEL_BOTTOM + BEZEL_TOP
const LID_T = 0.05
const BASE_W = 3.3
const BASE_D = 2.25
const BASE_T = 0.09
const OPEN_ANGLE = THREE.MathUtils.degToRad(105)

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))
// Progreso 0→1 de t dentro del tramo [a, b]
const span = (t, a, b) => clamp((t - a) / (b - a), 0, 1)
const easeInOut = (x) => x * x * (3 - 2 * x)
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3)
const lerp = (a, b, x) => a + (b - a) * x

// Pantalla: arriba de la línea de escaneo se ve la captura real,
// abajo un "plano" ámbar (grilla + bordes detectados de la captura)
const screenVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const screenFragment = /* glsl */ `
  uniform sampler2D map;
  uniform vec2 texel;
  uniform float uScan;
  uniform float uBand;
  uniform float uPower;
  uniform vec3 uAccent;
  varying vec2 vUv;

  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

  void main() {
    vec3 shot = texture2D(map, vUv).rgb;

    // Bordes de la captura (Sobel barato) → "wireframe" del sitio
    float l = luma(shot);
    float lx = luma(texture2D(map, vUv + vec2(texel.x * 1.5, 0.0)).rgb);
    float ly = luma(texture2D(map, vUv + vec2(0.0, texel.y * 1.5)).rgb);
    float edge = clamp((abs(l - lx) + abs(l - ly)) * 5.0, 0.0, 1.0);

    vec2 gp = vUv * vec2(28.0, 28.0 / ${SHOT_ASPECT.toFixed(4)});
    vec2 gd = abs(fract(gp - 0.5) - 0.5) / fwidth(gp);
    float grid = 1.0 - min(min(gd.x, gd.y), 1.0);

    vec3 blueprint = vec3(0.012, 0.011, 0.010) + uAccent * (grid * 0.16 + edge * 0.85 + l * 0.05);

    // y = 0 arriba, 1 abajo
    float y = 1.0 - vUv.y;
    float revealed = 1.0 - smoothstep(uScan - 0.004, uScan + 0.004, y);
    // Rastro ámbar justo detrás de la línea
    float trail = (1.0 - smoothstep(0.0, 0.12, uScan - y)) * revealed * uBand;
    float line = exp(-pow((y - uScan) * 90.0, 2.0)) * uBand;

    vec3 col = mix(blueprint, shot, revealed);
    col = mix(col, col * 0.6 + uAccent * 0.35, trail * 0.5);
    col += uAccent * line * 1.6;
    col *= uPower;

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

function makeShadowTexture() {
  const c = document.createElement("canvas")
  c.width = c.height = 128
  const g = c.getContext("2d")
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, "rgba(0,0,0,0.75)")
  grad.addColorStop(0.55, "rgba(0,0,0,0.35)")
  grad.addColorStop(1, "rgba(0,0,0,0)")
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

function buildLaptop(screenMat) {
  const laptop = new THREE.Group()

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0xe6e0d4,
    metalness: 0.55,
    roughness: 0.32,
    clearcoat: 0.4,
    clearcoatRoughness: 0.3,
  })
  const keyMat = new THREE.MeshStandardMaterial({ color: 0x232326, metalness: 0.2, roughness: 0.55 })
  const wellMat = new THREE.MeshStandardMaterial({ color: 0x8f8a82, metalness: 0.5, roughness: 0.5 })
  const padMat = new THREE.MeshPhysicalMaterial({ color: 0xd6d0c4, metalness: 0.5, roughness: 0.22 })
  const bezelMat = new THREE.MeshPhysicalMaterial({ color: 0x050506, metalness: 0, roughness: 0.12, clearcoat: 1 })

  // Base
  const base = new THREE.Mesh(new RoundedBoxGeometry(BASE_W, BASE_T, BASE_D, 4, 0.04), bodyMat)
  base.position.y = -BASE_T / 2
  laptop.add(base)

  // Teclado: zona hundida + teclas instanciadas
  const cols = 14
  const rows = 5
  const pitch = 0.188
  const well = new THREE.Mesh(new THREE.PlaneGeometry(cols * pitch + 0.08, rows * pitch + 0.08), wellMat)
  well.rotation.x = -Math.PI / 2
  well.position.set(0, 0.001, -0.42)
  laptop.add(well)

  const keyGeo = new RoundedBoxGeometry(0.158, 0.022, 0.158, 2, 0.02)
  const keys = new THREE.InstancedMesh(keyGeo, keyMat, cols * rows)
  const m = new THREE.Matrix4()
  let k = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      m.makeTranslation((c - (cols - 1) / 2) * pitch, 0.011, -0.42 + (r - (rows - 1) / 2) * pitch)
      keys.setMatrixAt(k++, m)
    }
  }
  laptop.add(keys)

  const pad = new THREE.Mesh(new RoundedBoxGeometry(1.15, 0.006, 0.64, 2, 0.003), padMat)
  pad.position.set(0, 0.001, 0.62)
  laptop.add(pad)

  // Tapa: bisagra en el borde trasero de la base.
  // rotation.x = PI/2 → cerrada sobre el teclado; PI/2 - 105° → abierta
  const hinge = new THREE.Group()
  hinge.position.set(0, 0, -BASE_D / 2 + 0.03)
  laptop.add(hinge)

  const lid = new THREE.Mesh(new RoundedBoxGeometry(LID_W, LID_H, LID_T, 4, 0.024), bodyMat)
  lid.position.set(0, LID_H / 2, -LID_T / 2)
  hinge.add(lid)

  const bezel = new THREE.Mesh(new THREE.PlaneGeometry(LID_W - 0.06, LID_H - 0.06), bezelMat)
  bezel.position.set(0, LID_H / 2, 0.002)
  hinge.add(bezel)

  const screenY = BEZEL_BOTTOM + SCREEN_H / 2
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), screenMat)
  screen.position.set(0, screenY, 0.004)
  hinge.add(screen)

  // Línea de escaneo 3D que sobresale apenas de la pantalla
  const glow = (opacity) =>
    new THREE.MeshBasicMaterial({
      color: ACCENT_TEXT,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  const scanLine = new THREE.Group()
  const lineCore = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W + 0.5, 0.012), glow(1))
  const lineHalo = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W + 0.5, 0.09), glow(0.12))
  scanLine.add(lineCore, lineHalo)
  scanLine.position.z = 0.03
  hinge.add(scanLine)

  // Sombra de contacto
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(BASE_W * 1.7, BASE_D * 1.7),
    new THREE.MeshBasicMaterial({ map: makeShadowTexture(), transparent: true, depthWrite: false })
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = -BASE_T - 0.005
  laptop.add(shadow)

  return {
    laptop,
    hinge,
    scanLine,
    lineCore,
    lineHalo,
    screenTop: screenY + SCREEN_H / 2,
  }
}

export function initProjects3D(section) {
  if (!section) return

  const canvas = section.querySelector("#projects-canvas")
  const viewport = section.querySelector(".projects-viewport")
  const scroller = section.querySelector(".projects-scroll")
  const items = [...section.querySelectorAll(".project-card")]
  const bars = [...section.querySelectorAll(".projects-progress span")]
  const hudName = section.querySelector('[data-hud="name"]')
  const hudLoad = section.querySelector('[data-hud="load"]')
  const hudArc = section.querySelector(".hud-dial-arc")
  const count = items.length
  if (!canvas || !count) return

  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  } catch {
    return // Sin WebGL: quedan las tarjetas estáticas
  }

  section.classList.add("projects-3d")
  section.style.setProperty("--projects-count", count)

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

  const camera = new THREE.PerspectiveCamera(28, 4 / 3, 0.1, 100)
  const target = new THREE.Vector3(0, -0.12, 0)

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2)
  keyLight.position.set(3, 5, 5)
  const rimLight = new THREE.PointLight(ACCENT, 40, 14)
  rimLight.position.set(-3.5, 2, -3)
  scene.add(keyLight, rimLight)

  // Capturas: se precargan todas y se cambia la textura según el proyecto activo
  const placeholder = new THREE.DataTexture(new Uint8Array([10, 10, 12, 255]), 1, 1)
  placeholder.needsUpdate = true
  const loader = new THREE.TextureLoader()
  const maxAniso = renderer.capabilities.getMaxAnisotropy()
  const textures = items.map((item) => {
    const img = item.querySelector(".project-img img")
    if (!img) return placeholder
    const tex = loader.load(img.getAttribute("src"), undefined, undefined, (err) => console.warn(err))
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = maxAniso
    return tex
  })

  const screenMat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: placeholder },
      texel: { value: new THREE.Vector2(1 / 1200, 1 / 693) },
      uScan: { value: 0 },
      uBand: { value: 0 },
      uPower: { value: 1 },
      uAccent: { value: new THREE.Color(ACCENT) },
    },
    vertexShader: screenVertex,
    fragmentShader: screenFragment,
    toneMapped: false,
  })

  const rig = new THREE.Group() // flotación / posición general
  scene.add(rig)
  const { laptop, hinge, scanLine, lineCore, lineHalo, screenTop } = buildLaptop(screenMat)
  rig.add(laptop)

  const glowMat = (opacity) =>
    new THREE.MeshBasicMaterial({
      color: ACCENT_TEXT,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  const pedestal = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.008, 6, 200), glowMat(0.3))
  pedestal.rotation.x = Math.PI / 2
  pedestal.scale.set(1, 0.72, 1)
  scene.add(pedestal)

  const dustGeo = new THREE.BufferGeometry()
  const dust = new Float32Array(200 * 3)
  for (let i = 0; i < dust.length; i += 3) {
    const r = 2.4 + Math.random() * 1.8
    const a = Math.random() * Math.PI * 2
    dust[i] = Math.cos(a) * r
    dust[i + 1] = (Math.random() - 0.3) * 3.6
    dust[i + 2] = Math.sin(a) * r
  }
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dust, 3))
  const dustPoints = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: ACCENT_TEXT, size: 0.025, transparent: true, opacity: 0.5, depthWrite: false })
  )
  scene.add(dustPoints)

  // Encuadre: la cámara se aleja si el visor es angosto, para que la laptop entre a lo ancho
  const FLOOR_Y = -0.95
  rig.position.y = FLOOR_Y + BASE_T
  pedestal.position.y = FLOOR_Y
  const placeCamera = () => {
    const vHalf = THREE.MathUtils.degToRad(camera.fov / 2)
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect)
    const dist = Math.max(7.3, 2.45 / Math.tan(hHalf))
    const dir = new THREE.Vector3(0, 0.2, 1).normalize()
    camera.position.copy(target).addScaledVector(dir, dist)
    camera.lookAt(target)
  }

  const resize = () => {
    const { width, height } = viewport.getBoundingClientRect()
    if (!width || !height) return
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    placeCamera()
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
    screenMat.uniforms.map.value = textures[index]
    hudName.textContent = items[index].querySelector("h3").textContent
  }

  // Ángulos de la laptop: entra desde 3/4 y queda casi de frente para leer la captura
  const ROT_ENTER = -0.95
  const ROT_HOLD = -0.2
  const ROT_EXIT = 0.7

  const frame = () => {
    const time = clock.getElapsedTime()
    progress += (scrollTarget() - progress) * 0.12

    const f = progress * count
    const index = Math.min(count - 1, Math.floor(f))
    const t = f - index
    setActive(index)

    // Línea de tiempo de cada proyecto:
    // entra (abre la tapa girando) → escanea la pantalla → se queda flotando → cierra y sale
    const first = index === 0
    const last = index === count - 1
    const grow = first ? 1 : easeOutCubic(span(t, 0, 0.1))
    const open = first ? 1 : easeInOut(span(t, 0.03, 0.24))
    const turn = first ? 1 : easeInOut(span(t, 0, 0.26))
    const close = last ? 0 : easeInOut(span(t, 0.84, 0.95))
    const shrink = last ? 0 : easeInOut(span(t, 0.9, 1))
    const leave = last ? 0 : easeInOut(span(t, 0.84, 1))

    const scale = Math.max(0.0001, grow * (1 - shrink))
    laptop.scale.setScalar(scale)
    hinge.rotation.x = Math.PI / 2 - OPEN_ANGLE * open * (1 - close)
    laptop.rotation.y = lerp(lerp(ROT_ENTER, ROT_HOLD, turn), ROT_EXIT, leave) + Math.sin(time * 0.5) * 0.04

    // Flotación suave
    rig.position.y = FLOOR_Y + BASE_T + 0.06 + Math.sin(time * 1.1) * 0.04
    rig.rotation.x = Math.sin(time * 0.7) * 0.015

    // Escaneo de arriba hacia abajo
    const scan = easeInOut(span(t, 0.24, 0.5))
    screenMat.uniforms.uScan.value = scan * 1.02
    const scanning = t > 0.22 && t < 0.52
    lineCore.material.opacity += ((scanning ? 1 : 0) - lineCore.material.opacity) * 0.15
    lineHalo.material.opacity = lineCore.material.opacity * 0.12
    screenMat.uniforms.uBand.value = lineCore.material.opacity
    scanLine.position.y = screenTop - Math.min(scan * 1.02, 1) * SCREEN_H
    // La pantalla "se enciende" mientras abre
    screenMat.uniforms.uPower.value = clamp(open * (1 - close) * 1.4 - 0.2, 0, 1)

    pedestal.scale.setScalar(0.85 + 0.15 * scale)
    pedestal.scale.y *= 0.72
    pedestal.material.opacity = 0.3 * scale
    dustPoints.rotation.y = time * 0.04 + progress * 2

    const load = Math.round(span(t, 0.24, 0.5) * 100)
    hudLoad.textContent = `${load}%`
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
