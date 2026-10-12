---
'@tanstack/ai-octane': minor
---

Require octane `>=0.12.0`.

- Octane 0.12 removed `Context.Provider`. `UI.Provider` and the other chat UI parts now render each context directly.
- Projects that compile the adapter's `.tsrx` source need `@tsrx/oxc` installed. Octane 0.12 made it an optional peer.
