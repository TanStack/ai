---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-preact': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-code-mode': minor
'@tanstack/ai-code-mode-skills': minor
---

Add typed runtime context for tools and middleware.

Tools and middleware can now declare the runtime context shape they require, and
`chat()`, `ChatClient`, and the framework `useChat` / `createChat` hooks infer
the merged requirement and type-check the `context` option you pass against it.

```typescript
type AppContext = { userId: string; db: Db }

const listNotes = toolDefinition({ name: 'list_notes', /* ... */ })
  .server<AppContext>((_input, ctx) =>
    ctx.context.db.notes.findMany({ userId: ctx.context.userId }),
  )

chat({
  adapter,
  messages,
  tools: [listNotes],
  context: { userId, db }, // required and type-checked because listNotes declares AppContext
})
```

Runtime context is request-local application state for tool and middleware
implementations (authenticated users, database clients, tenancy, feature flags,
loggers, browser services). It is never sent to the model and is distinct from
the AG-UI `RunAgentInput.context` protocol field.

Untyped tools and middleware continue to receive `unknown` context and do not
force a `context` option. Client tools receive client-local context via
`ChatClient` / `useChat`; use `forwardedProps` to hand serializable client data
to the server and map it into server context explicitly. See the new Runtime
Context guide for details.

Behavior change: tool output validation now also runs when a tool returns
`undefined` or `null`. Previously these values bypassed `outputSchema`
validation entirely; now the schema decides whether they are valid, so a tool
whose schema forbids `undefined`/`null` surfaces a validation error
(`output-error`) instead of silently passing. Tools whose schema permits
`null`/`undefined` (e.g. nullable or void outputs) are unaffected.
