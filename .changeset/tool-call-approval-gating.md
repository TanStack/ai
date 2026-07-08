---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
---

Gate the tool-call part's `approval` field on the tool's `needsApproval` flag.
Previously `approval?` was declared on every typed tool-call part regardless of
whether the tool could ever request approval. Now the flag is captured as a
literal type (`toolDefinition({ needsApproval: true })` → `true`) and threaded
through `ClientTool` / `ToolDefinitionInstance` / `ToolDefinition`, and
`ToolCallPartForTool` only includes `approval` for tools defined with
`needsApproval: true`:

```ts
const { messages } = useChat({ tools: [getGuitars, addToCart] }) // addToCart: needsApproval: true
for (const part of message.parts) {
  if (part.type !== 'tool-call') continue
  if (part.name === 'addToCart') part.approval?.id // ✅ typed
  if (part.name === 'getGuitars') part.approval // ✅ compile error — no such field
}
```

**Breaking (types only):** when you pass typed `tools`, reading `part.approval`
on a mixed tool-call union without first narrowing by `part.name` no longer
compiles — narrow to a `needsApproval: true` tool first. Untyped `useChat()`
(no `tools` generic) and the base `ToolCallPart` type are unaffected: `approval`
stays available on every tool-call part there. Runtime behavior is unchanged.

Adds a `TNeedsApproval extends boolean` type parameter (defaulting to `false`)
to the client tool types; existing explicit type arguments keep working via the
default.
