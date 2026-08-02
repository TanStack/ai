import type { UIMessage } from '@tanstack/ai-react'

type ToolResultPart = Extract<
  UIMessage['parts'][number],
  { type: 'tool-result' }
>

/** `string | Array<ContentPart>` — a tool result's raw content. */
type ToolResultContent = ToolResultPart['content']

type ContentPartItem = Exclude<ToolResultContent, string>[number]

/**
 * Reduce a tool-result part's `content` to a plain string for rendering.
 *
 * Tool results carry `string | Array<ContentPart>` (multimodal results are
 * normalized to an array of content parts upstream). The `ChatMessage`
 * renderers operate on plain strings, so array content is flattened to the
 * concatenation of its text parts. Non-text parts (image, audio, video,
 * document) have no string form here and are skipped — matching the
 * text-extraction behavior used elsewhere for `string | Array<ContentPart>`.
 */
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
