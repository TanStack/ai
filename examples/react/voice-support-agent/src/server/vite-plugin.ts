import { WebSocketServer } from 'ws'
import { handleCall } from './call.ts'
import { browserCarrier, twilioCarrier } from './carriers.ts'
import type { Plugin } from 'vite'

/**
 * Hosts two WebSocket paths on the Vite dev server:
 * - `/voice`: the softphone page in `src/routes/index.tsx`.
 * - `/twilio`: a Twilio Media Stream. Point a `<Stream url>` at it.
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
        const path = new URL(request.url ?? '/', 'http://localhost').pathname
        if (path !== '/voice' && path !== '/twilio') return
        wss.handleUpgrade(request, socket, head, (ws) => {
          const carrier =
            path === '/twilio' ? twilioCarrier(ws) : browserCarrier(ws)
          handleCall(ws, carrier).catch((error: unknown) => {
            console.error('call failed', error)
            ws.close(1011, 'call failed')
          })
        })
      })
    },
  }
}
