---
'@tanstack/ai-client': patch
---

When BYOK is on and no provider slug is passed, use the only saved key, or the only provider listed in `defineByok({ providers })`. A send with two saved keys and no slug still throws.
