import { useEffect, useRef } from 'react'

export function AudioSparkline({
  getData,
  color,
  label,
}: {
  getData: () => Uint8Array
  color: string
  label: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    function draw() {
      const data = getData()
      const width = canvas!.width
      const height = canvas!.height

      ctx!.fillStyle = '#1f2937'
      ctx!.fillRect(0, 0, width, height)

      ctx!.strokeStyle = color
      ctx!.lineWidth = 1
      ctx!.beginPath()

      const step = Math.max(1, Math.floor(data.length / width))

      for (let i = 0; i < width; i++) {
        const dataIndex = Math.min(i * step, data.length - 1)
        const value = data[dataIndex] ?? 128
        const y = height - (value / 255) * height

        if (i === 0) {
          ctx!.moveTo(i, y)
        } else {
          ctx!.lineTo(i, y)
        }
      }

      ctx!.stroke()

      ctx!.strokeStyle = '#4b5563'
      ctx!.setLineDash([2, 2])
      ctx!.beginPath()
      ctx!.moveTo(0, height / 2)
      ctx!.lineTo(width, height / 2)
      ctx!.stroke()
      ctx!.setLineDash([])

      animationRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [getData, color])

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-12">{label}</span>
      <canvas
        ref={canvasRef}
        width={200}
        height={40}
        className="rounded border border-gray-700"
      />
    </div>
  )
}
