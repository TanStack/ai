import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { AgentEvent } from '@earendil-works/pi-agent-core'

// A pi client: it posts pi messages to the `chat()` route in
// `api.pi-client.ts` and renders the pi agent events it gets back.
export const Route = createFileRoute('/pi-client')({
  component: PiClientPage,
})

function PiClientPage() {
  const [text, setText] = useState('')
  const [toolResults, setToolResults] = useState<Array<string>>([])
  const [ended, setEnded] = useState(false)

  useEffect(() => {
    function render(event: AgentEvent) {
      if (
        event.type === 'message_update' &&
        event.assistantMessageEvent.type === 'text_delta'
      ) {
        const { delta } = event.assistantMessageEvent
        setText((current) => current + delta)
      }
      if (event.type === 'tool_execution_end') {
        const first: unknown = event.result?.content?.[0]?.text
        setToolResults((current) => [...current, String(first)])
      }
      if (event.type === 'agent_end') setEnded(true)
    }

    void (async () => {
      const response = await fetch('/api/pi-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: 'pi-client',
          messages: [
            {
              role: 'user',
              content: 'Weather in Oslo?',
              timestamp: Date.now(),
            },
          ],
        }),
      })
      if (!response.body) return
      const reader = response.body
        .pipeThrough(new TextDecoderStream())
        .getReader()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += value
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) if (line) render(JSON.parse(line))
      }
    })()
  }, [])

  return (
    <div data-testid="pi-client-page">
      <div data-testid="tool-results">{toolResults.join(',')}</div>
      <div data-testid="assistant-text">{text}</div>
      <div data-testid="agent-ended">{String(ended)}</div>
    </div>
  )
}
