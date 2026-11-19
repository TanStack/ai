import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type * as ThreeModule from 'three'

type GlbViewerProps = {
  url: string
  /** Size classes for the viewer box. The default is `aspect-video w-full`. */
  className?: string
}

/**
 * Show a GLB model in a small three.js viewer.
 *
 * The user turns the model with a pointer drag and zooms with the wheel.
 * When `url` changes or the component unmounts, the viewer releases all
 * GPU resources (renderer, geometries, materials and textures).
 *
 * @example
 * <GlbViewer url="/api/models/robot.glb" />
 */
export function GlbViewer({
  url,
  className = 'aspect-video w-full',
}: GlbViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const host = containerRef.current
    if (!host) return
    const root = host

    let cancelled = false
    let release: (() => void) | undefined
    const abort = new AbortController()
    setLoading(true)
    setError(null)

    void (async () => {
      const [THREE, { GLTFLoader }, { OrbitControls }] = await Promise.all([
        import('three'),
        import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/controls/OrbitControls.js'),
      ])
      if (cancelled) return

      const scene = new THREE.Scene()
      scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2))
      const sun = new THREE.DirectionalLight(0xffffff, 2)
      sun.position.set(5, 10, 7)
      scene.add(sun)

      const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000)
      camera.position.set(0, 1, 3)

      const webgl = new THREE.WebGLRenderer({ antialias: true })
      webgl.setClearColor(0x111827, 1)
      webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      const canvas = webgl.domElement
      canvas.className = 'block h-full w-full touch-none'
      root.appendChild(canvas)
      canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault()
        setError('The 3D viewer lost the GPU context')
      })

      const controls = new OrbitControls(camera, canvas)
      controls.enableDamping = true

      function resize() {
        const width = root.clientWidth || 1
        const height = root.clientHeight || 1
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        webgl.setSize(width, height, false)
      }
      resize()
      const resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(root)

      let frame = 0
      function draw() {
        frame = requestAnimationFrame(draw)
        controls.update()
        webgl.render(scene, camera)
      }
      draw()

      let released = false
      release = () => {
        if (released) return
        released = true
        cancelAnimationFrame(frame)
        resizeObserver.disconnect()
        controls.dispose()
        disposeObject(THREE, scene)
        webgl.dispose()
        canvas.remove()
      }

      const response = await fetch(url, { signal: abort.signal })
      if (!response.ok) {
        throw new Error(
          `Could not download the model (HTTP ${response.status})`,
        )
      }
      const bytes = await response.arrayBuffer()
      const gltf = await new GLTFLoader().parseAsync(
        bytes,
        THREE.LoaderUtils.extractUrlBase(url),
      )
      const model = gltf.scene
      if (cancelled) {
        disposeObject(THREE, model)
        return
      }

      // Move the model to the origin and put the camera far enough back
      // to see all of it.
      const sphere = new THREE.Box3()
        .setFromObject(model)
        .getBoundingSphere(new THREE.Sphere())
      const radius = sphere.radius > 0 ? sphere.radius : 1
      model.position.sub(sphere.center)
      scene.add(model)

      const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2
      const distance = (radius / Math.sin(halfFov)) * 1.2
      camera.near = distance / 100
      camera.far = distance * 100
      camera.position.set(0, 0.4, 1).normalize().multiplyScalar(distance)
      camera.updateProjectionMatrix()
      controls.target.set(0, 0, 0)
      controls.maxDistance = distance * 10
      controls.update()
      setLoading(false)
    })().catch((caught: unknown) => {
      if (cancelled) return
      release?.()
      setLoading(false)
      setError(caught instanceof Error ? caught.message : String(caught))
    })

    return () => {
      cancelled = true
      abort.abort()
      release?.()
    }
  }, [url])

  return (
    <div className={`relative overflow-hidden bg-gray-900 ${className}`}>
      <div
        ref={containerRef}
        role="img"
        aria-label="3D model preview"
        className="absolute inset-0"
      />
      <p
        role="status"
        className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 text-sm text-gray-300"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading the 3D model…
          </>
        ) : null}
      </p>
      {error ? (
        <p
          role="alert"
          className="absolute inset-x-0 bottom-0 z-10 bg-black/70 px-4 py-2 text-sm text-red-300"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** Free the GPU memory of every geometry, material and texture under `root`. */
function disposeObject(THREE: typeof ThreeModule, root: ThreeModule.Object3D) {
  root.traverse((child) => {
    const isDrawable =
      child instanceof THREE.Mesh ||
      child instanceof THREE.Line ||
      child instanceof THREE.Points
    if (!isDrawable) return

    child.geometry.dispose()
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material]
    for (const material of materials) {
      const values = Object.values(material)
      for (const value of values) {
        if (value instanceof THREE.Texture) value.dispose()
      }
      material.dispose()
    }
  })
}
