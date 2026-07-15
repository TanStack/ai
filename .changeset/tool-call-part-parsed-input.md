---
'@tanstack/ai': minor
---

Populate the parsed `input` on tool-call message parts. `ToolCallPart` already
declared a typed `input?` field, but it was never written at runtime — only the
raw `arguments` string (and `output`) were set, so `part.input` was always
`undefined` and consumers had to fall back to `part.input ?? JSON.parse(part.arguments)`.

`input` is now set from the parsed arguments once they are complete
(`state: 'input-complete'` and later, including `approval-requested`), in the
streaming processor, the `TOOL_CALL_END`-with-parsed-input path, and when
hydrating history via `modelMessagesToUIMessages`. While arguments are still
streaming, `input` stays `undefined` and the raw `arguments` string remains the
live source. A tool call that terminates in an error state may also keep `input`
unset. `arguments` is unchanged, always present, and not deprecated.

With typed tools (`useChat({ tools })`), `part.input` is fully typed per tool
via the `part.name` discriminant — matching `part.output`.
