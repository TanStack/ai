---
'@tanstack/ai-harness': minor
---

Keep the secrets of a session out of what it keeps and sends.

- Each session replaces every secret that it gave out with `[redacted]`. These are the values of `run.keys` (also from env vars) and `run.credentials`, connector credentials and OAuth tokens, and secret answers (each string field of an answer with fields). It scrubs log records, feed events, plugin state (also in a `Map` or a `Set`), notes, the model context, and tool results, also after the own middleware of an agent run. It also scrubs the error frames of the HTTP handler, the WebSocket, and the stdio worker. It finds the raw, JSON-escaped, and URL-encoded forms, and skips values shorter than 6 characters. A secret split across two streaming deltas stays in those two events, and a secret that is JSON-escaped two times is not found.
- `scrubSecrets` from `@tanstack/ai-harness` is the one from `@tanstack/ai/byok`.
- A `step.do` value that holds a secret of the session throws, on the first run and on a replay, so the log never keeps a secret. Read the secret outside `step.do`.
- A retry of an input with a secret in it is a duplicate, not a conflict: the check compares the input without the secrets, as the log keeps it.
- The log keeps the final result of each tool call: the result after every `onAfterToolCall` hook (also the agent's own middleware in an agent run), scrubbed. A replacement from a hook wins, also on an error. Recovery after a crash gives the model that result.
- An answer to a `secret: true` question that reaches a host that does not own the log goes through the `credentials` store of the host, as a one-time reference with the credential type `secret_answer` and an `expiresAt` 24 hours later. Only the reference goes into the input lane, and the owner reads and deletes it. The references that nobody read go when the question ends. A kept answer for a run again goes when the run ends. Without `createHarnessHost({ credentials })`, the answer is rejected with `secret_answer_needs_credentials`. A used, expired, or unknown reference is rejected with `unknown_secret_answer`. `credentials.list` does not show the `secret_answer` type.
