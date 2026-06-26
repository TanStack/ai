---
'@tanstack/ai-sandbox': patch
---

Fix workspace bootstrap on sandbox providers without a writable stdin
(`capabilities.writableStdin === false`, e.g. Daytona / Vercel / Cloudflare):

- The bootstrap shell previously **always** drove setup commands over a spawned
  process's stdin (a sentinel-echo protocol), which those providers reject — so
  any `defineWorkspace({ setup })` step threw `stdin is not writable`. The
  bootstrap shell now falls back to an **exec-backed** implementation that
  threads `cwd`/exported env across discrete `process.exec` calls, reproducing
  the persistent-shell semantics without stdin.
- `defineSandbox().ensure()` now **destroys the freshly-created sandbox if
  bootstrap fails** (before it has been recorded), instead of leaking an
  orphaned — and, for hosted providers, billed — sandbox on a failed/retried run.
