---
'@tanstack/ai-sandbox': patch
---

Make sandbox file-diff correct and observable (follow-up to #892):

- `diff()` now synthesizes an add-patch for any file git isn't tracking (a file the agent created **and every later edit to it**), keyed on tracked-ness at the baseline rather than on the event being a `create` — so agent-created files no longer stream empty diffs. A tracked file identical to the baseline still diffs empty, and a transient git-show probe failure no longer fabricates a bogus add-patch.
- The synthesized patch now matches `git diff`'s add-file shape (`diff --git` header, `new file mode`, repo-relative paths).
- **git-ignored files are withheld from the diff feed**: the file event still fires (you're notified it changed) but `diff()` returns `''`, so a secret like a `.env` never has its contents surfaced.
- The native `fs.watch` watcher re-seeds lazily if its initial workspace listing fails, so a pre-existing file is correctly reported as a `change` (not a `create`) on first edit.
- The exec-poll watcher no longer fabricates phantom `create`/`delete` storms: a failed poll (thrown exec, or non-zero exit with no output) preserves the previous snapshot, a failed initial poll seeds without diffing, and a partial (`find` permission-denied) poll is merged rather than diffed so transiently-unreadable files aren't reported as deleted.
- Every swallowed git/exec/fs failure — in the diff accessors, both watcher paths (exec-poll and native `fs.watch`), the git-baseline capture, and per-hook dispatch — is now logged (real anomalies under `errors`, expected-empty conditions under the `sandbox` debug category) instead of silently becoming empty data.
