---
'@tanstack/ai-sandbox-docker': patch
'@tanstack/ai-sandbox-vercel': patch
'@tanstack/ai-sandbox-cloudflare': patch
---

Write files in 32KB base64 chunks so snapshot restore no longer hits Linux `MAX_ARG_STRLEN`.
