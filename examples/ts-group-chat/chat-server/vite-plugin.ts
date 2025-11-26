// Vite WebSocket plugin for handling Cap'n Web RPC connections
import { Plugin } from "vite";
import { WebSocketServer } from "ws";
import { newWebSocketRpcSession } from "capnweb";
import { ChatServer } from "./capnweb-rpc.js";

// Custom WebSocket RPC plugin for Vite
export function websocketRpcPlugin(): Plugin {
  return {
    name: "websocket-rpc-plugin",
    configureServer(server) {
      if (!server.httpServer) return;

      const wss = new WebSocketServer({
        noServer: true,
      });

      server.httpServer.on("upgrade", (request, socket, head) => {
        const pathname = new URL(request.url!, `http://${request.headers.host}`)
          .pathname;

        // Only handle our specific websocket path
        if (pathname === "/api/websocket") {
          wss.handleUpgrade(request, socket, head, (ws) => {
            console.log(
              "WebSocket RPC connection established on /api/websocket"
            );

            // Create a new RPC server instance for this connection
            const chatServer = new ChatServer();

            // Store WebSocket reference in server
            chatServer.setWebSocket(ws);

            // Set up Cap'n Web RPC over this websocket
            // Cast to any to handle Node.js WebSocket vs Browser WebSocket interface differences
            newWebSocketRpcSession(ws as any, chatServer);
          });
        }
      });
    },
  };
}
