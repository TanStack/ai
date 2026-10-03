import { createFileRoute } from '@tanstack/react-router'
import {
  canAccess,
  getHarnessForThread,
  getHost,
  noteThread,
} from '@/server/harness'
import { state } from '@/server/store'
import '@/server/meta'
import type { ModelMessage } from '@tanstack/ai'

/**
 * The session event feed is in-memory (lost on restart), but the chat messages
 * are persisted. When a thread is opened with an empty feed — a fresh server, or
 * a session that has since been disposed — rebuild the timeline from the stored
 * messages so a revisited team shows its history instead of "No activity yet".
 *
 * We synthesize the same AG-UI events the live run emitted (TEXT_MESSAGE_*,
 * TOOL_CALL_*), so the client's one projection path renders them identically.
 * Each message's channel comes from the `[channel:<id>]` tag the injector prefixes
 * onto the prompt; a reply/tool inherits the channel of the last tagged prompt.
 * ponytail: tool cards rebuild from `toolCalls` + tool-result messages; if a
 * future message shape drops those, only the text bubbles rehydrate.
 */
function historyEvents(
  msgs: Array<ModelMessage>,
): Array<{ event: Record<string, unknown> }> {
  const out: Array<{ event: Record<string, unknown> }> = []
  let channelId: string | undefined
  const textOf = (content: ModelMessage['content']): string => {
    if (typeof content === 'string') return content
    if (Array.isArray(content))
      return content
        .filter((p) => p.type === 'text')
        .map((p) => ('content' in p ? p.content : ''))
        .join('')
    return ''
  }
  for (const m of msgs as Array<ModelMessage & Record<string, any>>) {
    const id = m.id ?? `${m.role}-${out.length}`
    if (m.role === 'user' || m.role === 'assistant') {
      let text = textOf(m.content)
      const tag = text.match(/^\[channel:([^\]]+)\]\s*/)
      if (tag) {
        // A tagged prompt sets the channel for itself and the reply that follows.
        channelId = tag[1]
        text = text.slice(tag[0].length)
      }
      out.push({
        event: {
          type: 'TEXT_MESSAGE_START',
          messageId: id,
          role: m.role,
          channelId,
        },
      })
      if (text)
        out.push({
          event: {
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: id,
            delta: text,
            channelId,
          },
        })
      for (const tc of (m.toolCalls ?? []) as Array<any>) {
        out.push({
          event: {
            type: 'TOOL_CALL_START',
            toolCallId: tc.id,
            toolCallName: tc.function?.name ?? tc.name ?? 'tool',
            channelId,
          },
        })
        const args = tc.function?.arguments ?? tc.args ?? ''
        out.push({
          event: {
            type: 'TOOL_CALL_ARGS',
            toolCallId: tc.id,
            delta: typeof args === 'string' ? args : JSON.stringify(args),
            channelId,
          },
        })
      }
    } else if (m.role === 'tool' && m.toolCallId) {
      out.push({
        event: {
          type: 'TOOL_CALL_RESULT',
          toolCallId: m.toolCallId,
          content: textOf(m.content),
          channelId,
        },
      })
    }
  }
  return out
}

// A live tail of a thread's session feed: replays from a cursor, then follows new
// events (interactive runs, injected tools, timers, webhooks) as they arrive. The
// channel view opens one per member and projects every event — the single
// projection path for everything out-of-band, no polling.
export const Route = createFileRoute('/api/tail')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const threadId = url.searchParams.get('threadId')
        if (!threadId) {
          return Response.json({ error: 'threadId required' }, { status: 400 })
        }
        // EventSource resumes with Last-Event-ID; fall back to ?from or the start.
        const from =
          request.headers.get('last-event-id') ??
          url.searchParams.get('from') ??
          '0'
        canAccess({ id: 'local' }, threadId)
        const harnessName = url.searchParams.get('harness')
        if (harnessName) noteThread(threadId, harnessName)
        const session = await getHost().open(getHarnessForThread(threadId), {
          threadId,
        })
        // The events already in the feed are history; only events appended after
        // this head are live. The client projects history with `replay: true` so a
        // resolved interrupt replayed from the feed does not resurface as a pending
        // approval — the authoritative pending set is the snapshot below.
        const snap = session.snapshot()
        const head = snap.cursor
        const encoder = new TextEncoder()
        const controllerRef = new AbortController()
        request.signal.addEventListener('abort', () => controllerRef.abort(), {
          once: true,
        })
        const stream = new ReadableStream({
          async start(controller) {
            controller.enqueue(encoder.encode(': ok\n\n'))
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  snapshot: {
                    status: snap.status,
                    pendingInterrupts: snap.pendingInterrupts,
                    pendingQuestions: snap.pendingQuestions,
                  },
                })}\n\n`,
              ),
            )
            let live = !head || head === '0'
            // Empty in-memory feed but persisted messages exist → rebuild the
            // timeline from storage so a revisited/restarted team isn't blank.
            if (live && from === '0') {
              const stored = state.messages[threadId] ?? []
              if (stored.length > 0) {
                for (const { event } of historyEvents(stored)) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ event, replay: true })}\n\n`,
                    ),
                  )
                }
              }
            }
            try {
              for await (const entry of session.events({
                from,
                signal: controllerRef.signal,
              })) {
                const frame =
                  `id: ${entry.cursor}\n` +
                  `data: ${JSON.stringify({ cursor: entry.cursor, event: entry.event, replay: !live })}\n\n`
                controller.enqueue(encoder.encode(frame))
                if (!live && entry.cursor === head) live = true
              }
            } catch {
              // aborted / closed
            }
            try {
              controller.close()
            } catch {
              // already closed
            }
          },
          cancel() {
            controllerRef.abort()
          },
        })
        return new Response(stream, {
          headers: {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache, no-transform',
            connection: 'keep-alive',
          },
        })
      },
    },
  },
})
