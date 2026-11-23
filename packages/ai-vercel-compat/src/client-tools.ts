import { jsonSchema, tool } from 'ai'
import type { ToolSet } from 'ai'
import { isRecord } from './data-parts'

/**
 * Add the tools that a TanStack `useChat` client declares (`clientTools` in
 * the request body, sent by `fromChatTransport`) to the tools of an AI SDK
 * route. A client tool has no `execute`, so `streamText` stops at its call
 * and the client runs it. A server tool wins on a name clash.
 *
 * ```ts
 * const body = await request.json()
 * const result = streamText({
 *   model,
 *   messages: await convertToModelMessages(body.messages),
 *   tools: clientToolsFromAISDKBody(body, { weather }),
 * })
 * ```
 *
 * @throws An error when `clientTools` is present but is not a list of
 *   `{ name, description, parameters }` with a JSON Schema object.
 */
export function clientToolsFromAISDKBody<TServerTools extends ToolSet>(
  body: unknown,
  serverTools: TServerTools,
): TServerTools & ToolSet {
  const declared = isRecord(body) ? body.clientTools : undefined
  if (declared === undefined) return serverTools
  if (!Array.isArray(declared)) {
    throw new Error('`clientTools` must be an array.')
  }
  // `fromEntries` defines own properties, so a `__proto__` name is inert.
  const clientTools: ToolSet = Object.fromEntries(
    declared.map((entry: unknown) => {
      if (
        !isRecord(entry) ||
        typeof entry.name !== 'string' ||
        entry.name === '' ||
        typeof entry.description !== 'string' ||
        !isRecord(entry.parameters)
      ) {
        throw new Error(
          'Each client tool must have a `name`, a `description` and JSON Schema `parameters`.',
        )
      }
      // No `execute`: `streamText` stops at the call and the client runs it.
      return [
        entry.name,
        tool({
          description: entry.description,
          inputSchema: jsonSchema(entry.parameters),
        }),
      ]
    }),
  )
  return { ...clientTools, ...serverTools }
}
