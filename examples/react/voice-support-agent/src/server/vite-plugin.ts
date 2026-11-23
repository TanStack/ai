import { WebSocketServer } from 'ws'
import { handleCall } from './call.ts'
import {
  browserCarrier,
  isStringRecord,
  parseTwilioFrame,
  twilioCarrier,
} from './carriers.ts'
import { setupCall } from './providers.ts'
import type { RawData, WebSocket } from 'ws'
import type { Plugin } from 'vite'
import type { Carrier } from './carriers.ts'

/**
 * Hosts two WebSocket paths on the Vite dev server:
 * - `/voice`: the softphone page. Its first frame is a JSON `start` message
 *   with the character, the provider per hop, and the caller's own keys.
 *   It takes local connections only, so a tunnel cannot use the env keys.
 * - `/twilio`: a Twilio Media Stream. Point a `<Stream url>` at it. Choices
 *   and a `token` come from `<Parameter>` elements, keys from env.
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
        // A request through a tunnel has the tunnel's host name.
        const host = request.headers.host ?? ''
        const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)
        // A browser always sends Origin, and a page cannot change it. So a
        // site you visit cannot open /voice and use your env keys.
        const sameOrigin =
          request.headers.origin?.replace(/^https?:\/\//, '') === host
        if (url.pathname === '/voice' && !(local && sameOrigin)) {
          socket.end('HTTP/1.1 403 Forbidden\r\n\r\n')
          return
        }
        wss.handleUpgrade(request, socket, head, (ws) => {
          // A bad frame emits `error`. With no listener, it stops the server.
          ws.on('error', (error) => console.error('socket error', error))
          const run =
            url.pathname === '/twilio'
              ? startFromTwilio(ws)
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

/**
 * Twilio sends `connected`, then `start` with the stream id and the
 * `<Parameter>` values, then audio. The call starts on `start`, so it hears
 * all of the audio. The `token` must match `TWILIO_STREAM_TOKEN`. Only your
 * TwiML has it, so no one else can place a call on your keys.
 */
function startFromTwilio(ws: WebSocket) {
  return new Promise<void>((resolve, reject) => {
    const onFrame = (data: RawData) => {
      const frame = parseTwilioFrame(data)
      if (frame?.event !== 'start') return
      ws.off('message', onFrame)
      const { streamSid, customParameters } = frame.start
      const token = process.env.TWILIO_STREAM_TOKEN
      if (!token || customParameters.token !== token) {
        ws.close(1008, 'bad token')
        resolve()
        return
      }
      start(ws, twilioCarrier(ws, streamSid), customParameters, {}).then(
        resolve,
        reject,
      )
    }
    ws.on('message', onFrame)
  })
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
  carrier: Carrier,
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
