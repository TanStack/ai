---
'@tanstack/ai-client': patch
---

Export the `RunAgentInputContext` type from `@tanstack/ai-client`. It was
already part of the public `ConnectConnectionAdapter` / `SubscribeConnectionAdapter`
signatures but wasn't re-exported from the package entry, so authors of
custom connection adapters couldn't import the named type when typing their
`connect` / `send` implementations. No runtime change.
