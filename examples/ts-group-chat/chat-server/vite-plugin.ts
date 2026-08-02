// Vite WebSocket plugin for handling Cap'n Web RPC connections
import { WebSocketServer } from 'ws'
import { newWebSocketRpcSession } from 'capnweb'
import { ChatServer } from './capnweb-rpc.js'
import type { Plugin } from 'vite'
import type { ChatNotifierApi } from './chat-api.js'

export function websocketRpcPlugin(): Plugin {
  return {
    name: 'websocket-rpc-plugin',
    enforce: 'pre',
    configureServer(server) {
      if (!server.httpServer) return

      const wss = new WebSocketServer({
        noServer: true,
      })

      server.httpServer.on('upgrade', (request, socket, head) => {
        const pathname = new URL(request.url, `http://${request.headers.host}`)
          .pathname

        if (pathname === '/api/websocket') {
          wss.handleUpgrade(request, socket, head, (ws) => {
            console.log(
              'WebSocket RPC connection established on /api/websocket',
            )

            const chatServer = new ChatServer()
            chatServer.setWebSocket(ws)

            // Client exports ChatNotifier as localMain; server receives that stub here.
            const clientNotifier = newWebSocketRpcSession(
              ws as never,
              chatServer,
            ) as unknown as ChatNotifierApi

            chatServer.setClientNotifier(clientNotifier)
          })
        }
      })
    },
  }
}
