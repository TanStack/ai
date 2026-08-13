import { createSignal, onCleanup, onMount } from 'solid-js'
import {
  Header,
  HeaderLogo,
  MainPanel,
  ThemeContextProvider,
} from '@tanstack/devtools-ui'
import {
  aiEventClient,
  createAIDevtoolsEventEnvelope,
  emitAIDevtoolsEvent,
} from '@tanstack/ai-event-client'
import { useStyles } from '../styles/use-styles'
import { AIProvider } from '../store/ai-context'
import { HookDashboard, HookDetails } from './hooks'

import type { TanStackDevtoolsTheme } from '@tanstack/devtools-ui'

interface DevtoolProps {
  theme: TanStackDevtoolsTheme
}

export default function Devtools(props: DevtoolProps) {
  return (
    <ThemeContextProvider theme={props.theme}>
      <AIProvider>
        <DevtoolsContent />
      </AIProvider>
    </ThemeContextProvider>
  )
}

function DevtoolsContent() {
  const styles = useStyles()
  const [leftPanelWidth, setLeftPanelWidth] = createSignal(300)
  const [isDragging, setIsDragging] = createSignal(false)

  let dragStartX = 0
  let dragStartWidth = 0

  const handleMouseDown = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    dragStartX = e.clientX
    dragStartWidth = leftPanelWidth()
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging()) return

    e.preventDefault()
    const deltaX = e.clientX - dragStartX
    const newWidth = Math.max(150, Math.min(800, dragStartWidth + deltaX))
    setLeftPanelWidth(newWidth)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  onMount(() => {
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    const openedAt = Date.now()
    emitAIDevtoolsEvent('devtools:opened', {
      ...createAIDevtoolsEventEnvelope({
        eventType: 'devtools:opened',
        source: 'devtools',
        visibility: 'devtools-action',
        timestamp: openedAt,
      }),
    })
    emitAIDevtoolsEvent('devtools:request-state', {
      ...createAIDevtoolsEventEnvelope({
        eventType: 'devtools:request-state',
        source: 'devtools',
        visibility: 'devtools-action',
        timestamp: openedAt + 1,
      }),
    })
  })

  onCleanup(() => {
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
    // If the panel unmounts mid-drag, the mouseup handler never fires;
    // reset the global drag styles so the host page isn't stuck with
    // col-resize cursor / unselectable body.
    if (isDragging()) {
      setIsDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    aiEventClient.emit('devtools:closed', {
      ...createAIDevtoolsEventEnvelope({
        eventType: 'devtools:closed',
        source: 'devtools',
        visibility: 'devtools-action',
        timestamp: Date.now(),
      }),
    })
  })

  return (
    <MainPanel>
      <div class={styles().shellRoot} data-testid="ai-devtools-panel">
        <Header>
          <HeaderLogo flavor={{ light: '#ec4899', dark: '#ec4899' }}>
            TanStack AI
          </HeaderLogo>
        </Header>

        <div class={styles().mainContainer}>
          <div
            class={styles().leftPanel}
            data-testid="ai-devtools-left-panel"
            style={{
              width: `${leftPanelWidth()}px`,
              'min-width': '150px',
              'max-width': '800px',
            }}
          >
            <div class={styles().shell.sectionHeader}>AI Hooks</div>

            <HookDashboard />
          </div>

          <div
            class={`${styles().dragHandle} ${isDragging() ? 'dragging' : ''}`}
            onMouseDown={handleMouseDown}
          />

          <div
            class={styles().rightPanel}
            data-testid="ai-devtools-right-panel"
            style={{ flex: 1 }}
          >
            <HookDetails />
          </div>
        </div>
      </div>
    </MainPanel>
  )
}
