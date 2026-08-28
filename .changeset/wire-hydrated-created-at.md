---
'@tanstack/ai': patch
---

Accept JSON-hydrated `createdAt` ISO strings in `uiMessagesToWire`. After
`reconstructChat`, the field is a string, so `.toISOString()` threw on the
next send.
