import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { Object3D, PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import { marbleSplatProxyPath, splatFileName } from '@/lib/marble-splat'

type MarbleViewerProps = {
  splatUrl: string
  metricScaleFactor?: number
  groundPlaneOffset?: number
}

type ViewerRuntime = {
  scene: Scene
  camera: PerspectiveCamera
  webgl: WebGLRenderer
  controls: { update: (camera: Object3D) => void }
}

export function MarbleViewer({
  splatUrl,
  metricScaleFactor,
  groundPlaneOffset,
}: MarbleViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<ViewerRuntime | null>(null)
  const splatRef = useRef<{ dispose: () => void } | null>(null)
  const [runtimeReady, setRuntimeReady] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const host = containerRef.current
    if (!host) return
    const root = host

    let cancelled = false
    let webgl: WebGLRenderer | undefined
    let resizeObserver: ResizeObserver | undefined

    void (async () => {
      const THREE = await import('three')
      const spark = await import('@sparkjsdev/spark')
      if (cancelled) return

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 8000)
      camera.position.set(0, 1.6, 0)

      webgl = new THREE.WebGLRenderer({ antialias: true })
      webgl.setClearColor(0x000000, 1)
      webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      const canvas = webgl.domElement
      canvas.tabIndex = 0
      canvas.className = 'block h-full w-full outline-none'
      root.appendChild(canvas)

      const sparkRenderer = new spark.SparkRenderer({ renderer: webgl })
      scene.add(sparkRenderer)
      const controls = new spark.SparkControls({ canvas })
      controls.fpsMovement.enable = false
      canvas.addEventListener('pointerdown', () => {
        canvas.focus()
      })
      canvas.addEventListener('focus', () => {
        controls.fpsMovement.enable = true
      })
      canvas.addEventListener('blur', () => {
        controls.fpsMovement.enable = false
      })
      canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault()
        setError('The 3D viewer lost the GPU context')
      })

      function resize() {
        if (!webgl) return
        const width = root.clientWidth || 1
        const height = root.clientHeight || 1
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        webgl.setSize(width, height, false)
      }
      resize()
      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(root)

      runtimeRef.current = { scene, camera, webgl, controls }
      webgl.setAnimationLoop(() => {
        const runtime = runtimeRef.current
        if (!runtime) return
        runtime.controls.update(runtime.camera)
        runtime.webgl.render(runtime.scene, runtime.camera)
      })
      setRuntimeReady((count) => count + 1)
    })().catch((caught: unknown) => {
      if (cancelled) return
      setLoading(false)
      setError(caught instanceof Error ? caught.message : String(caught))
    })

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      splatRef.current?.dispose()
      splatRef.current = null
      if (webgl) {
        webgl.setAnimationLoop(null)
        webgl.dispose()
        webgl.domElement.remove()
      }
      runtimeRef.current = null
    }
  }, [])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtimeReady || !runtime) return

    let cancelled = false
    const abort = new AbortController()
    setLoading(true)
    setError(null)

    splatRef.current?.dispose()
    splatRef.current = null

    void (async () => {
      const spark = await import('@sparkjsdev/spark')
      const response = await fetch(marbleSplatProxyPath(splatUrl), {
        signal: abort.signal,
      })
      if (!response.ok) throw new Error('Splat download failed')
      const fileBytes = await response.arrayBuffer()
      if (cancelled) return

      const mesh = new spark.SplatMesh({
        fileBytes,
        fileName: splatFileName(splatUrl),
      })
      // Marble SPZ is OpenCV. Spark/Three.js need a 180deg X flip.
      mesh.quaternion.set(1, 0, 0, 0)
      if (metricScaleFactor != null && metricScaleFactor > 0) {
        mesh.scale.setScalar(metricScaleFactor)
      }
      if (groundPlaneOffset != null) {
        mesh.position.y = -groundPlaneOffset
      }
      runtime.scene.add(mesh)
      splatRef.current = mesh
      await mesh.initialized
      if (cancelled) {
        mesh.dispose()
        return
      }
      setLoading(false)
    })().catch((caught: unknown) => {
      if (cancelled || abort.signal.aborted) return
      setLoading(false)
      setError(caught instanceof Error ? caught.message : String(caught))
    })

    return () => {
      cancelled = true
      abort.abort()
      splatRef.current?.dispose()
      splatRef.current = null
    }
  }, [runtimeReady, splatUrl, metricScaleFactor, groundPlaneOffset])

  return (
    <div className="relative aspect-video w-full bg-black">
      <div ref={containerRef} className="absolute inset-0" />
      {loading ? (
        <p className="absolute inset-0 z-10 flex items-center justify-center gap-2 text-sm text-gray-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading the 3D world…
        </p>
      ) : null}
      {error ? (
        <p className="absolute inset-x-0 bottom-0 z-10 bg-black/70 px-4 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  )
}
