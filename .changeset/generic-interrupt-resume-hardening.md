---
'@tanstack/ai': patch
'@tanstack/ai-client': patch
'@tanstack/ai-persistence': patch
---

Harden first-party generic interrupt resume.

Ephemeral continuation now rehydrates an already-parsed display payload instead of running `payloadSchema` again, so transforming schemas keep working. Invalid `expiresAt` values fail closed, binding parse uses one reader, and sequential interrupt-store writes preflight before changing records.
