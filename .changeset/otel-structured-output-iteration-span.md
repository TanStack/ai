---
"@tanstack/ai": patch
---

fix(otelMiddleware): open an iteration span for structured-output finalization (#1054)

No-tools + `outputSchema` calls skip the agent loop and only run the structured-output finalization request. That path previously emitted only a root `chat` span — no generation record, and `captureContent` was a silent no-op. `onConfig` now also opens an iteration span when `phase === 'structuredOutput'`, so each provider model call is observable. Native-combined mode is unaffected (it never fires that phase).
