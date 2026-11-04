---
'@tanstack/ai-sandbox': minor
---

New optional signals on the sandbox contract: `git.clone({ signal })`, `git.push(dir, { signal })`, `git.pull(dir, { signal })`, `snapshot(label, { signal })`, `fork({ signal })`, and `ports.connect(port, { signal })`. The exec-backed git passes the signal to each git command.
