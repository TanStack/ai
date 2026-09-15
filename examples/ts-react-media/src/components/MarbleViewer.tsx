import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { marbleSplatProxyPath, splatFileName } from '@/lib/marble-splat'

type MarbleViewerProps = {
  splatUrl: string
  metricScaleFactor?: number
  groundPlaneOffset?: number
}

export function MarbleViewer({
  splatUrl,
  metricScaleFactor,
  groundPlaneOffset,
}: MarbleViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false
    let renderer: import('three').WebGLRenderer | null = null
    let splat: { dispose: () => void } | null = null
    let resizeObserver: ResizeObserver | null = null

    async function start() {
      const THREE = await import('three')
      const spark = await import('@sparkjsdev/spark')
      if (disposed || !container) return
      const host = container

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 8000)
      camera.position.set(0, 1.6, 0)

      const webgl = new THREE.WebGLRenderer({ antialias: true })
      webgl.setClearColor(0x000000, 1)
      webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      webgl.domElement.tabIndex = 0
      webgl.domElement.className = 'block h-full w-full outline-none'
      host.appendChild(webgl.domElement)
      renderer = webgl

      const sparkRenderer = new spark.SparkRenderer({ renderer: webgl })
      scene.add(sparkRenderer)
      const controls = new spark.SparkControls({ canvas: webgl.domElement })
      controls.fpsMovement.enable = false
      webgl.domElement.addEventListener('pointerdown', () => {
        webgl.domElement.focus()
      })
      webgl.domElement.addEventListener('focus', () => {
        controls.fpsMovement.enable = true
      })
      webgl.domElement.addEventListener('blur', () => {
        controls.fpsMovement.enable = false
      })

      function resize() {
        const width = host.clientWidth || 1
        const height = host.clientHeight || 1
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        webgl.setSize(width, height, false)
      }
      resize()
      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(host)

      const response = await fetch(marbleSplatProxyPath(splatUrl))
      if (!response.ok) {
        throw new Error('Splat download failed')
      }
      const fileBytes = await response.arrayBuffer()
      if (disposed) return

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
      scene.add(mesh)
      splat = mesh
      await mesh.initialized
      if (disposed) return
      setLoading(false)

      webgl.setAnimationLoop(() => {
        controls.update(camera)
        webgl.render(scene, camera)
      })
    }

    start().catch((caught: unknown) => {
      if (disposed) return
      setLoading(false)
      setError(caught instanceof Error ? caught.message : String(caught))
    })

    return () => {
      disposed = true
      resizeObserver?.disconnect()
      if (renderer) {
        renderer.setAnimationLoop(null)
        renderer.dispose()
        renderer.domElement.remove()
      }
      splat?.dispose()
    }
  }, [splatUrl, metricScaleFactor, groundPlaneOffset])

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
