---
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
---

Add `ChainClient` and React `useChain` for server-side `chain()` activities: demux `chain:step` progress into a reactive steps map, stream native structured-output partials onto the active step (`steps[name].partial`), surface `generation:result`, and support stop/reset with connection or fetcher transports.
