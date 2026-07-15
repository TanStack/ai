import { createFileRoute } from '@tanstack/react-router'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'

/**
 * In-process MCP server for the **INTERACTIVE** half of the MCP Apps demo — a
 * tiny storefront that demonstrates the full bridge round-trip.
 *
 *   - `show_products` links the `ui://shop/products` resource. Its widget is an
 *     interactive MCP App: it speaks the MCP Apps app-bridge (postMessage
 *     JSON-RPC) and, when you click "Buy now", calls `buy_product` BACK on this
 *     server through the bridge:
 *
 *       [Buy now] → tools/call (postMessage) → AppRenderer.onCallTool
 *         → createMcpAppBridge.callTool → POST /api/mcp-apps-call
 *         → createMcpAppCallHandler → buy_product() here → result to the widget
 *
 *   - `buy_product` is the tool the widget calls. The same-server allowlist in
 *     `createMcpAppCallHandler` permits it because this server exposes it.
 *
 * The widget's app-bridge client is hand-rolled in plain JS (no build step) so
 * the example stays a single self-contained file; see WIDGET_HTML below.
 */
const PRODUCTS_URI = 'ui://shop/products'

interface Product {
  id: string
  name: string
  emoji: string
  price: number
  blurb: string
}

const PRODUCTS: Array<Product> = [
  {
    id: 'aurora-headphones',
    name: 'Aurora Headphones',
    emoji: '🎧',
    price: 199,
    blurb: 'Wireless ANC over-ear',
  },
  {
    id: 'nimbus-keyboard',
    name: 'Nimbus Keyboard',
    emoji: '⌨️',
    price: 129,
    blurb: 'Low-profile mechanical',
  },
  {
    id: 'lumen-lamp',
    name: 'Lumen Desk Lamp',
    emoji: '💡',
    price: 79,
    blurb: 'Warm/cool dimmable',
  },
]

// Hand-rolled MCP Apps widget. Plain JS (no bundler): it completes the
// `ui/initialize` handshake with the host, renders the catalog, and on "Buy
// now" sends a `tools/call` for `buy_product` and renders the server's reply.
// The inner script avoids template literals so it can live in this TS template
// string; PRODUCTS is injected as JSON.
function widgetHtml(): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      :root { color-scheme: light dark; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: transparent; color: #e5e7eb; }
      .shop { max-width: 720px; margin: 4px auto; padding: 4px; }
      .head { font-size: 15px; font-weight: 600; margin: 4px 2px 12px; color: #f3f4f6; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
      @media (max-width: 560px) { .grid { grid-template-columns: 1fr; } }
      .card { background: #111827; border: 1px solid #374151; border-radius: 14px; padding: 16px; display: flex; flex-direction: column; }
      .emoji { font-size: 40px; line-height: 1; }
      .name { font-weight: 600; margin-top: 10px; color: #f9fafb; }
      .blurb { font-size: 12px; color: #9ca3af; margin-top: 2px; flex: 1; }
      .price { font-size: 18px; font-weight: 700; margin: 10px 0; color: #fdba74; }
      button { border: none; border-radius: 10px; padding: 9px 12px; font-size: 13px; font-weight: 600; cursor: pointer; background: #ea580c; color: #fff; transition: background .15s; }
      button:hover:not(:disabled) { background: #f97316; }
      button:disabled { opacity: .6; cursor: default; }
      .ok { background: #064e3b !important; color: #6ee7b7 !important; }
      .status { font-size: 12px; color: #9ca3af; margin: 10px 2px 2px; min-height: 16px; }
    </style>
  </head>
  <body>
    <div class="shop">
      <div class="head">🛍️ Demo Store</div>
      <div class="grid" id="grid"></div>
      <div class="status" id="status">Connecting to host…</div>
    </div>
    <script>
      (function () {
        var PRODUCTS = ${JSON.stringify(PRODUCTS)};
        var PARENT = window.parent;
        var nextId = 1;
        var pending = new Map();
        var connected = false;

        function send(msg) { PARENT.postMessage(msg, '*'); }
        function request(method, params) {
          var id = nextId++;
          send({ jsonrpc: '2.0', id: id, method: method, params: params });
          return new Promise(function (resolve, reject) { pending.set(id, { resolve: resolve, reject: reject }); });
        }
        function notify(method, params) { send({ jsonrpc: '2.0', method: method, params: params || {} }); }
        function respond(id, result) { send({ jsonrpc: '2.0', id: id, result: result }); }
        function respondError(id, code, message) { send({ jsonrpc: '2.0', id: id, error: { code: code, message: message } }); }

        window.addEventListener('message', function (event) {
          if (event.source !== PARENT) return;
          var msg = event.data;
          if (!msg || msg.jsonrpc !== '2.0') return;
          // A request FROM the host (has a method): answer ping, reject the rest.
          if (msg.method && msg.id !== undefined && msg.id !== null) {
            if (msg.method === 'ping') { respond(msg.id, {}); return; }
            respondError(msg.id, -32601, 'Method not found: ' + msg.method);
            return;
          }
          // A response to one of OUR requests.
          if ((msg.id !== undefined && msg.id !== null) && pending.has(msg.id)) {
            var p = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) p.reject(new Error(msg.error.message || 'request failed'));
            else p.resolve(msg.result);
          }
          // Otherwise a host notification (tool-input, tool-result, …) — ignore.
        });

        function setStatus(t) { document.getElementById('status').textContent = t; }

        // MCPAppResource wraps the bridge result twice ({content, structuredContent});
        // dig out the innermost structured object (the order).
        function unwrap(res) {
          var r = res;
          for (var i = 0; i < 3 && r && r.structuredContent; i++) r = r.structuredContent;
          if (r && r.content && r.content[0] && typeof r.content[0].text === 'string') {
            try { return JSON.parse(r.content[0].text); } catch (e) { /* fall through */ }
          }
          return r;
        }

        async function buy(product, btn) {
          btn.disabled = true;
          btn.textContent = 'Placing order…';
          try {
            var res = await request('tools/call', { name: 'buy_product', arguments: { productId: product.id } });
            var order = unwrap(res) || {};
            btn.textContent = '✓ Ordered';
            btn.className = 'ok';
            setStatus('Order ' + (order.orderId || '?') + ' confirmed for ' + product.name + ' · ETA ' + (order.eta || 'soon'));
          } catch (e) {
            btn.disabled = false;
            btn.textContent = 'Buy now';
            setStatus('Order failed: ' + (e && e.message ? e.message : 'unknown error'));
          }
        }

        function render() {
          var grid = document.getElementById('grid');
          grid.innerHTML = '';
          PRODUCTS.forEach(function (product) {
            var card = document.createElement('div'); card.className = 'card';
            var emoji = document.createElement('div'); emoji.className = 'emoji'; emoji.textContent = product.emoji;
            var name = document.createElement('div'); name.className = 'name'; name.textContent = product.name;
            var blurb = document.createElement('div'); blurb.className = 'blurb'; blurb.textContent = product.blurb;
            var price = document.createElement('div'); price.className = 'price'; price.textContent = '$' + product.price;
            var btn = document.createElement('button'); btn.textContent = 'Buy now';
            btn.disabled = !connected;
            btn.addEventListener('click', function () { buy(product, btn); });
            card.appendChild(emoji); card.appendChild(name); card.appendChild(blurb); card.appendChild(price); card.appendChild(btn);
            grid.appendChild(card);
          });
        }

        async function connect() {
          render();
          try {
            await request('ui/initialize', { appInfo: { name: 'Shop', version: '1.0.0' }, appCapabilities: {}, protocolVersion: '2026-01-26' });
            notify('ui/notifications/initialized');
            connected = true;
            render();
            setStatus('Pick a product and click "Buy now" — it calls buy_product back on the server.');
          } catch (e) {
            setStatus('Could not connect to host: ' + (e && e.message ? e.message : 'unknown error'));
          }
        }

        connect();
      })();
    </script>
  </body>
</html>`
}

function createShopMcpServer(): McpServer {
  const server = new McpServer({ name: 'mcp-apps-shop', version: '0.0.1' })

  const show = server.registerTool(
    'show_products',
    {
      description:
        'Show the product catalog as an interactive storefront widget the user can buy from.',
      inputSchema: {},
      outputSchema: { count: z.number() },
    },
    () => {
      const payload = { count: PRODUCTS.length }
      return {
        content: [
          {
            type: 'text' as const,
            text: `Showing ${PRODUCTS.length} products: ${PRODUCTS.map((p) => p.name).join(', ')}.`,
          },
        ],
        structuredContent: payload,
      }
    },
  )
  show._meta = { ui: { resourceUri: PRODUCTS_URI } }

  // The tool the widget calls back through the bridge when "Buy now" is clicked.
  server.registerTool(
    'buy_product',
    {
      description:
        'Place an order for a product by id. Called by the storefront widget.',
      inputSchema: { productId: z.string() },
      outputSchema: {
        orderId: z.string(),
        productId: z.string(),
        name: z.string(),
        price: z.number(),
        status: z.string(),
        eta: z.string(),
      },
    },
    ({ productId }) => {
      const product = PRODUCTS.find((p) => p.id === productId)
      if (!product) {
        return {
          content: [
            { type: 'text' as const, text: `Unknown product: ${productId}` },
          ],
          isError: true,
        }
      }
      // Deterministic-ish order id from the product id (no Date/random needed).
      const orderId = `ORD-${(productId.length * 7 + product.price).toString().padStart(4, '0')}`
      const order = {
        orderId,
        productId,
        name: product.name,
        price: product.price,
        status: 'confirmed',
        eta: '2-4 days',
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(order) }],
        structuredContent: order,
      }
    },
  )

  server.registerResource(
    'shop_products_ui',
    PRODUCTS_URI,
    { description: 'Interactive storefront widget', mimeType: 'text/html' },
    () => ({
      contents: [
        { uri: PRODUCTS_URI, mimeType: 'text/html', text: widgetHtml() },
      ],
    }),
  )

  return server
}

async function handleMcpRequest(request: Request): Promise<Response> {
  const server = createShopMcpServer()
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })
  await server.connect(transport)
  return transport.handleRequest(request)
}

export const Route = createFileRoute('/api/mcp-apps-shop-server')({
  server: {
    handlers: {
      POST: ({ request }) => handleMcpRequest(request),
      GET: ({ request }) => handleMcpRequest(request),
      DELETE: ({ request }) => handleMcpRequest(request),
    },
  },
})
