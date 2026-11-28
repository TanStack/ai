---
'@tanstack/ai-sandbox-vercel': patch
---

`fs.write` now uploads the file with one `sandbox.writeFiles` call. It used to run one `exec` per 32 KiB chunk, so a 1 MiB file took 33 round trips, and a failed or aborted write left a truncated file. The abort signal now reaches the upload.
