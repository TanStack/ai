import type { UIMessage } from '@tanstack/ai-react'

type ToolResultPart = Extract<
  UIMessage['parts'][number],
  { type: 'tool-result' }
>

/** `string | Array<ContentPart>` — a tool result's raw content. */
type ToolResultContent = ToolResultPart['content']

type ContentPartItem = Exclude<ToolResultContent, string>[number]

export function toolResultContentToString(content: ToolResultContent): string {
  if (typeof content === 'string') return content
  return content
    .filter(
      (part): part is Extract<ContentPartItem, { type: 'text' }> =>
        part.type === 'text',
    )
    .map((part) => part.content)
    .join('')
}
