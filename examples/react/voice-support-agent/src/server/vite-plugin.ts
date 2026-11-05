import { WebSocketServer } from 'ws'
import { handleCall } from './call.ts'
import { browserCarrier, twilioCarrier } from './carriers.ts'
import { CHARACTERS, isCharacterName } from './characters.ts'
import type { Plugin } from 'vite'

/**
 * Hosts two WebSocket paths on the Vite dev server:
 * - `/voice`: the softphone page in `src/routes/index.tsx`.
 * - `/twilio`: a Twilio Media Stream. Point a `<Stream url>` at it.
 *
 * Both take `?character=<name>` from `characters.ts`. Default: helpful.
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
        const path = url.pathname
        if (path !== '/voice' && path !== '/twilio') return
        const name = url.searchParams.get('character') ?? 'helpful'
        if (!isCharacterName(name)) {
          socket.destroy()
          return
        }
        wss.handleUpgrade(request, socket, head, (ws) => {
          const carrier =
            path === '/twilio' ? twilioCarrier(ws) : browserCarrier(ws)
          handleCall(ws, carrier, CHARACTERS[name]).catch((error: unknown) => {
            console.error('call failed', error)
            ws.close(1011, 'call failed')
          })
        })
      })
    },
  }
}
