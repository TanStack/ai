---
'@tanstack/ai-sandbox-docker': minor
---

`dockerSandbox()` now copies a `localSource(dir)` folder into a new container: the files that git lists, their uncommitted changes, and the history of the current branch. The folder must be a Git repository, and the image must have git (for example `node:24`).
