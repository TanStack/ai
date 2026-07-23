---
'@tanstack/ai': patch
---

`toRunErrorPayload` now falls back to a numeric `status` field when a thrown
error carries no `code`. Some SDK error classes report the HTTP status only as
`status: number` and no `code` (for example Google's `@google/genai`
`ApiError`), so their status was previously dropped and the resulting
`RUN_ERROR` event surfaced `code: undefined` — indistinguishable from an
unknown failure. A string `status` (an HTTP reason phrase such as `"Forbidden"`
or a symbolic status such as `"PERMISSION_DENIED"`) is intentionally ignored so
only the numeric HTTP code is forwarded; an explicit `code` still wins.
