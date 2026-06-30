---
'@tanstack/ai-react': patch
---

`useChat` now constructs its internal `ChatClient` via a `useState` lazy initializer instead of `useMemo`. `useMemo` is documented as a performance hint that React may discard and recompute, which could spuriously build a second client (each owns a `StreamProcessor`, a devtools bridge, and a connection); `useState`'s initializer is a per-mount "runs once" guarantee. The client is still recreated synchronously when `id` changes, via the "adjust state during render" pattern. Also removes an unused internal ref. No public API or behavior change.
