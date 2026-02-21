'use client'

import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react'

// Dynamically import Excalidraw to avoid SSR issues (window is not defined)
const Excalidraw = lazy(async () => {
  // Import CSS inside the dynamic import to avoid SSR issues
  await import('@excalidraw/excalidraw/index.css')
  const mod = await import('@excalidraw/excalidraw')
  return { default: mod.Excalidraw }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExcalidrawElement = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExcalidrawImperativeAPI = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AppState = any

export interface ExcalidrawCanvasProps {
  id: string
  elements?: ExcalidrawElement[]
  width?: string | number
  height?: number
  viewModeEnabled?: boolean
  gridModeEnabled?: boolean
  theme?: 'light' | 'dark'
  onElementsChange?: (elements: ExcalidrawElement[]) => void
}

export function ExcalidrawCanvas({
  id,
  elements = [],
  width = '100%',
  height = 500,
  viewModeEnabled = false,
  gridModeEnabled = false,
  theme = 'light',
  onElementsChange,
}: ExcalidrawCanvasProps) {
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null)
  const [isClient, setIsClient] = useState(false)
  const lastElementsRef = useRef<ExcalidrawElement[]>(elements)
  const isExternalUpdateRef = useRef(false)

  // Only render on client
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Sync external element changes into Excalidraw
  useEffect(() => {
    if (excalidrawAPI && elements.length > 0) {
      // Check if elements actually changed (not just reference)
      const currentElements = excalidrawAPI.getSceneElements()
      const elementsChanged =
        JSON.stringify(elements) !== JSON.stringify(currentElements)

      if (elementsChanged) {
        isExternalUpdateRef.current = true
        excalidrawAPI.updateScene({ elements })
        lastElementsRef.current = elements
        // Reset flag after a short delay to allow onChange to fire
        setTimeout(() => {
          isExternalUpdateRef.current = false
        }, 100)
      }
    }
  }, [elements, excalidrawAPI])

  // Handle user edits
  const handleChange = useCallback(
    (newElements: readonly ExcalidrawElement[], _appState: AppState) => {
      // Skip if this is an external update
      if (isExternalUpdateRef.current) {
        return
      }

      // Only notify if elements actually changed (not just selection)
      const elementsChanged =
        JSON.stringify(newElements) !== JSON.stringify(lastElementsRef.current)

      if (elementsChanged && onElementsChange) {
        lastElementsRef.current = [...newElements]
        onElementsChange([...newElements])
      }
    },
    [onElementsChange],
  )

  if (!isClient) {
    return (
      <div
        data-excalidraw-id={id}
        style={{
          width: typeof width === 'number' ? `${width}px` : width,
          height: `${height}px`,
        }}
        className="border border-gray-600 rounded-lg overflow-hidden bg-white flex items-center justify-center"
      >
        <div className="text-gray-500">Loading diagram editor...</div>
      </div>
    )
  }

  return (
    <div
      data-excalidraw-id={id}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: `${height}px`,
      }}
      className="border border-gray-600 rounded-lg overflow-hidden"
    >
      <Suspense
        fallback={
          <div className="w-full h-full flex items-center justify-center bg-white">
            <div className="text-gray-500">Loading Excalidraw...</div>
          </div>
        }
      >
        <Excalidraw
          excalidrawAPI={(api: ExcalidrawImperativeAPI) => setExcalidrawAPI(api)}
          initialData={{ elements }}
          onChange={handleChange}
          viewModeEnabled={viewModeEnabled}
          gridModeEnabled={gridModeEnabled}
          theme={theme}
          UIOptions={{
            canvasActions: {
              changeViewBackgroundColor: true,
              clearCanvas: !viewModeEnabled,
              export: { saveFileToDisk: true },
              loadScene: !viewModeEnabled,
              saveToActiveFile: false,
              toggleTheme: true,
            },
          }}
        />
      </Suspense>
    </div>
  )
}
