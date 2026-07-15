---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
---

Add defineTransaction (server) and useTransaction/createTransaction (client): declare app-defined verbs — chatVerb for conversational surfaces, verb for one-shot work with schema-validated inputs — behind one endpoint and drive them from one fully typed client hook. A verb's execute can compose sibling verbs via ctx.call into a server-composed transaction: one request runs the whole pipeline, every sub-run streams back live, and a single stop()/disconnect aborts everything. clientTransaction binds a type-only client stub to a server definition without mirroring inert verb callbacks in the browser.
