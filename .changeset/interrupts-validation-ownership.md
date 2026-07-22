---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
---

Interrupts: the application owns wire-schema validation, and the hashing
dependency is gone.

The library no longer transforms a generic interrupt's wire JSON Schema into a
validator or validates the resolved value against it, on either the client or
the server. Whatever you pass to `resolveInterrupt` (client) or send in the
`resume` batch (server) flows through as-is. Validate it yourself if you need to
trust it, e.g. with `z.fromJSONSchema(interrupt.responseSchema).safeParse(value)`
on the client and your own check on the server. Validation of a tool's
code-authored Standard Schema (`approvalSchema` / `inputSchema`) is unchanged.

This drops the `ajv` and `ajv-formats` dependencies. Interrupt binding hashes and
resolution fingerprints now use a small bundled SHA-256 instead of
`@noble/hashes`, so that dependency is gone too. The wire hash shape
(`sha256:<hex>`) is unchanged.
