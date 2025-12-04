import { createSignal, onCleanup, onMount } from 'solid-js'
import { Header, HeaderLogo, MainPanel } from '@tanstack/devtools-ui'
import { useStyles } from '../styles/use-styles'
import { AIProvider } from '../store/ai-context'
import { ConversationsList } from './ConversationsList'
import { ConversationDetails } from './ConversationDetails'

export default function Devtools() {
  return (
    <AIProvider>
      <DevtoolsContent />
    </AIProvider>
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
  })

  onCleanup(() => {
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  })

  return (
    <MainPanel>
      <Header>
        <HeaderLogo flavor={{ light: '#ec4899', dark: '#ec4899' }}>
          TanStack AI
        </HeaderLogo>
      </Header>

      <div class={styles().mainContainer}>
        <div
          class={styles().leftPanel}
          style={{
            width: `${leftPanelWidth()}px`,
            'min-width': '150px',
            'max-width': '800px',
          }}
        >
          {/* Section header */}
          <div class={styles().shell.sectionHeader}>Active Conversations</div>

          <ConversationsList />
        </div>

        <div
          class={`${styles().dragHandle} ${isDragging() ? 'dragging' : ''}`}
          onMouseDown={handleMouseDown}
        />

        <div class={styles().rightPanel} style={{ flex: 1 }}>
          <ConversationDetails />
        </div>
      </div>
    </MainPanel>
  )
}
