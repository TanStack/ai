---
'@tanstack/ai-angular': patch
---

`InjectChatOptions` no longer exposes `onResumeStateChange`.

`injectChat` surfaces the run identity as the `runId` signal and pending
interrupts through `interrupts` / `pendingInterrupts` / `onInterruptStateChange`,
exactly like React / Solid / Vue / Svelte / Preact — but Angular's omit list was
missing the key, so `onResumeStateChange` leaked as a public option and
`injectChat` forwarded to it. Both the key and the forwarding are gone; a caller
passing it now gets a type error instead of depending on an option no other
framework offers.
