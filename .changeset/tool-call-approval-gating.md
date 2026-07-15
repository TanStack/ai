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

## ⚠️ Breaking change (types only)

**This is the primary migration surface for this release.** When you pass a typed
`tools` array to `useChat` / `createChat` / `injectChat`, reading `part.approval`
on a mixed tool-call union **without first narrowing by `part.name`** no longer
compiles. Code that previously did `part.approval?.id` in a generic handler over
all tool-call parts must be updated:

```ts
// ❌ No longer compiles on a typed mixed union
part.approval?.id

// ✅ Narrow to an approval-required tool first
if (part.name === 'deleteAccount') part.approval?.id

// ✅ Or guard with `in`
if ('approval' in part) part.approval?.id

// ✅ Or type the handler against the base (untyped) ToolCallPart
function handleApproval(part: ToolCallPart) {
  return part.approval?.id
}
```

Untyped `useChat()` (no inferred `tools` generic) and the base `ToolCallPart`
type are unaffected: `approval` stays available on every tool-call part there.
**Runtime behavior is unchanged** — only TypeScript narrowing is stricter.

Adds a `TNeedsApproval extends boolean` type parameter (defaulting to `false`)
to the client tool types; existing explicit type arguments keep working via the
default. Literal capture requires `toolDefinition({ needsApproval: true })` at
the call site — a dynamic `needsApproval: boolean` variable will not gate the
type.
