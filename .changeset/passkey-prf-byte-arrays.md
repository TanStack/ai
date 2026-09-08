---
'@tanstack/ai-client': patch
---

Accept validated 32-byte arrays from passkey providers such as 1Password before deriving the BYOK encryption key. Preserve the key bytes and reject malformed arrays before saving.
