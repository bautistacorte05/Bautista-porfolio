import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js"

const vertexShader = `
  attribute vec3 position;
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`

const fragmentShader = `
  precision highp float;
  uniform vec2 resolution;
  uniform float time;
  uniform float xScale;
  uniform float yScale;
  uniform float distortion;

  void main() {
    vec2 p = (gl_FragCoord.xy * 2.0 - resolution) / min(resolution.x, resolution.y);

    float d = length(p) * distortion;

    float rx = p.x * (1.0 + d);
    float gx = p.x;
    float bx = p.x * (1.0 - d);

    float r = 0.05 / abs(p.y + sin((rx + time) * xScale) * yScale);
    float g = 0.05 / abs(p.y + sin((gx + time) * xScale) * yScale);
    float b = 0.05 / abs(p.y + sin((bx + time) * xScale) * yScale);

    gl_FragColor = vec4(r, g, b, 1.0);
  }
`

export function initShader(canvas) {
  const scene = new THREE.Scene()
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: false })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setClearColor(new THREE.Color(0x000000))

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, -1)

  const uniforms = {
    resolution: { value: [window.innerWidth, window.innerHeight] },
    time: { value: 0.0 },
    xScale: { value: 1.0 },
    yScale: { value: 0.5 },
    distortion: { value: 0.05 },
  }

  const positions = new THREE.BufferAttribute(
    new Float32Array([
      -1.0, -1.0, 0.0,
       1.0, -1.0, 0.0,
      -1.0,  1.0, 0.0,
       1.0, -1.0, 0.0,
      -1.0,  1.0, 0.0,
       1.0,  1.0, 0.0,
    ]),
    3
  )

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", positions)

  const material = new THREE.RawShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    side: THREE.DoubleSide,
  })

  const mesh = new THREE.Mesh(geometry, material)
  scene.add(mesh)

  const handleResize = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    renderer.setSize(w, h, false)
    uniforms.resolution.value = [w, h]
  }

  handleResize()

  let animId

  const animate = () => {
    uniforms.time.value += 0.01
    renderer.render(scene, camera)
    animId = requestAnimationFrame(animate)
  }

  const handleVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(animId)
    } else {
      animate()
    }
  }

  animate()
  window.addEventListener("resize", handleResize)
  document.addEventListener("visibilitychange", handleVisibility)

  return () => {
    cancelAnimationFrame(animId)
    window.removeEventListener("resize", handleResize)
    document.removeEventListener("visibilitychange", handleVisibility)
    scene.remove(mesh)
    geometry.dispose()
    material.dispose()
    renderer.dispose()
  }
}
