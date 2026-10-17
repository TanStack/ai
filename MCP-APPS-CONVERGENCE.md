# Open Generative UI ⇄ MCP Apps (SEP-1865) — Convergence

**Status:** built and browser-verified 2026-10-16. Everything below is grounded
in running, committed code.

## Thesis

"With the iframe switch, are we close to the MCP-in-app standard?" — **Yes; the
two converged.** MCP Apps (SEP-1865, Final Jan 2026) standardized exactly the
pattern Tier F built independently: UI in a sandboxed iframe, all host traffic
over `postMessage`, host-pushed structured render data + theme CSS variables,
actions performed *through* the host, host-enforced CSP. Two confirmations:

1. **The SDK already ships the MCP Apps _host_.** `ai-mcp` reads
   `_meta.ui.resourceUri`, fetches `ui://` resources, and emits `ui-resource`
   parts; `@tanstack/ai-react`'s `MCPAppResource` renders them via
   `@mcp-ui/client`'s `AppRenderer` over `@modelcontextprotocol/ext-apps`.
2. **Tier F rebuilt the same thing** — and is now wired to speak the *same wire
   protocol*, in both directions.

## What's proven (and how)

| Capability | Status | Verified by |
|---|---|---|
| Host renders external MCP Apps widgets | ✅ (SDK) | pre-existing `ai-mcp` + `MCPAppResource` |
| Authored **html-fragment** renders via the SDK's `MCPAppResource` | ✅ | browser: `ui://genui/…@… · MCP App`, `[AppFrame] App initialized` |
| html-fragment is **MCP-Apps-native** (connect + self-size) | ✅ | browser: content-sized frame, `ui/notifications/size-changed` |
| Authored **react-tsx** is MCP-Apps-native in-app (ext-apps `AppBridge`↔`App`) | ✅ | browser: Expense Tracker renders inline via `protocol="mcp-app"`, sized |
| **External** MCP hosts render our UI over MCP | ✅ | `scripts/verify-mcp.mjs` PASS: discover UI-linked tool → call → read `ui://` resource |
| In-app `chat()` authors artifacts live (create/revise) | ✅ | browser: Emaj7 / spend monitor / expense tracker |

## Architecture

**Two render paths, one protocol.**
- **html-fragment** → `MCPAppResource` (`@mcp-ui/client` `AppRenderer`): a
  self-contained doc injected into the mcp-ui sandbox proxy (cross-origin,
  `scripts/serve-sandbox.mjs`). The fragment's `window.__ogui` is backed by the
  ext-apps `App` guest (`FRAGMENT_GUEST_SOURCE`, auto-wire transport).
- **react-tsx** → our `FrameArtifactRenderer` with `protocol="mcp-app"`: the
  shell is URL-loaded from the sandbox serving origin (needs the import map +
  built bundle that `AppRenderer`'s `document.write` can't provide), and driven
  by a lazily-loaded ext-apps **`AppBridge`** connected directly to the iframe;
  the guest is the same adapter in **direct** transport mode.

**Bridge mapping (ogui/1 → SEP-1865).** `setState`→`ui/update-model-context`;
`emitIntent` action→`tools/call`, submit→`ui/message`; data←`tool-input`/
`tool-result`; theme←`hostContext.styles.variables`; size→`size-changed`.
Determinism and build-at-write are preserved Tier F value-adds.

**Resource identity.** Artifacts address as `ui://genui/<id>@<rev>`
(`text/html;profile=mcp-app`). The middleware emits a standard `ui-resource`
part in-app; the MCP server (`createMCPServer`) exposes the same resources +
a `create_artifact` tool (`_meta.ui.resourceUri`) for external hosts.

**Additive throughout.** The original `ogui/1` bridge still works (default);
every MCP Apps capability was added alongside it.

## Honest remaining follow-ups

- **react-tsx over _external_ MCP** needs a serving origin or an inline-bundle
  build variant (its import map + built bundle aren't self-contained). The MCP
  server currently serves portable **html-fragment** artifacts; react-tsx is
  MCP-Apps-native **in-app** only.
- **Action-intent routing to the agent.** Submit intents reach the chat
  (`ui/message`→`sendPrompt`); action intents (`tools/call`) are acked by the
  host but not yet routed back into the conversation.
- **DEBUG "unknown source" postMessage noise** from the `@mcp-ui/client` proxy
  during the html-fragment handshake — non-blocking (init + sizing both work).
- **Live-model react-tsx reliability.** Models drift on library APIs
  (`useTable` vs `useReactTable`, non-existent `@host/ui` exports). Mitigated
  with exact-export guidance, forgiving shim aliases, and a per-message error
  boundary; not eliminated.

## Where the code lives

- Middleware + `ui://` + resource emission: `packages/ai-generative-ui/src/artifacts/`.
- Guest adapter + shell + host renderer: `packages/ai-generative-ui/src/frame/{guest,shell}.ts`, `src/react/frame.tsx`.
- Example host: `examples/generative-ui/server/{chat-route,frame-host,frame-plugin,mcp-server}.ts`, `public/sandbox_proxy.html`, `scripts/{serve-sandbox,verify-mcp}.mjs`.
