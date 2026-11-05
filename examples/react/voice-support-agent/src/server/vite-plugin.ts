import { WebSocketServer } from 'ws'
import { handleCall } from './call.ts'
import { browserCarrier, twilioCarrier } from './carriers.ts'
import { setupCall } from './providers.ts'
import type { WebSocket } from 'ws'
import type { Plugin } from 'vite'

/**
 * Hosts two WebSocket paths on the Vite dev server:
 * - `/voice`: the softphone page. Its first frame is a JSON `start` message
 *   with the character, the provider per hop, and the caller's own keys.
 * - `/twilio`: a Twilio Media Stream. Point a `<Stream url>` at it. Choices
 *   come from the query string and keys from env.
 *
 * Start server routes answer HTTP requests, so the sockets live here instead.
 */
export function voiceServer(): Plugin {
  return {
    name: 'voice-server',
    configureServer(server) {
      if (!server.httpServer) return
      const wss = new WebSocketServer({ noServer: true })
      server.httpServer.on('upgrade', (request, socket, head) => {
        const url = new URL(request.url ?? '/', 'http://localhost')
        if (url.pathname !== '/voice' && url.pathname !== '/twilio') return
        wss.handleUpgrade(request, socket, head, (ws) => {
          const run =
            url.pathname === '/twilio'
              ? start(
                  ws,
                  twilioCarrier(ws),
                  Object.fromEntries(url.searchParams),
                  {},
                )
              : startFromFirstFrame(ws)
          run.catch((error: unknown) => {
            console.error('call failed', error)
            ws.close(1011, 'call failed')
          })
        })
      })
    },
  }
}

/** The page sends `{ type: 'start', choice, headers }` before any audio. */
function startFromFirstFrame(ws: WebSocket) {
  return new Promise<void>((resolve, reject) => {
    ws.once('message', (data) => {
      let frame: unknown
      try {
        frame = JSON.parse(data.toString())
      } catch {
        ws.close(1003, 'expected a start frame')
        resolve()
        return
      }
      if (!isStartFrame(frame)) {
        ws.close(1003, 'expected a start frame')
        resolve()
        return
      }
      start(ws, browserCarrier(ws), frame.choice, frame.headers).then(
        resolve,
        reject,
      )
    })
  })
}

async function start(
  ws: WebSocket,
  carrier: ReturnType<typeof browserCarrier>,
  choice: Record<string, string>,
  headers: Record<string, string>,
) {
  const setup = setupCall(choice, headers)
  if ('missing' in setup) {
    carrier.caption(
      'agent',
      `No ${setup.missing} key. Add one and call again.`,
      true,
    )
    ws.close(1008, `missing ${setup.missing} key`)
    return
  }
  await handleCall(ws, carrier, setup)
}

type StartFrame = {
  type: 'start'
  choice: Record<string, string>
  headers: Record<string, string>
}

function isStartFrame(value: unknown): value is StartFrame {
  if (typeof value !== 'object' || value === null) return false
  if (!('type' in value) || value.type !== 'start') return false
  return (
    'choice' in value &&
    isStringRecord(value.choice) &&
    'headers' in value &&
    isStringRecord(value.headers)
  )
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === 'string')
  )
}
