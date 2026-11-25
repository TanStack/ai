---
'@tanstack/ai-sandbox-cloudflare': patch
---

Run each `exec` and `spawn` command in a subshell. Cloudflare runs every command in one shared shell session, so a command that called `exit` ended the session and every later command failed. This broke the `@tanstack/ai-computer-sandbox` driver on Cloudflare.
