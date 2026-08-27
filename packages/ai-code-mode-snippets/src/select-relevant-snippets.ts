import { chat } from '@tanstack/ai'
import type { AnyTextAdapter, ModelMessage, StreamChunk } from '@tanstack/ai'
import type { Snippet, SnippetIndexEntry, SnippetStorage } from './types'

interface SelectRelevantSnippetsOptions {
  adapter: AnyTextAdapter

  messages: Array<ModelMessage>

  snippetIndex: Array<SnippetIndexEntry>

  maxSnippets: number

  storage: SnippetStorage
}

export async function selectRelevantSnippets({
  adapter,
  messages,
  snippetIndex,
  maxSnippets,
  storage,
}: SelectRelevantSnippetsOptions): Promise<Array<Snippet>> {
  // Early exit conditions
  if (snippetIndex.length === 0) return []
  if (messages.length === 0) return []

  // Build context from recent messages (last 5)
  const recentMessages = messages.slice(-5)
  const recentContext = recentMessages
    .map((m) => {
      let content: string
      if (typeof m.content === 'string') {
        content = m.content
      } else if (Array.isArray(m.content)) {
        // Handle content parts (text, images, etc.)
        content = m.content
          .map((part: unknown) => {
            if (typeof part === 'string') return part
            if (part && typeof part === 'object' && 'text' in part)
              return (part as { text: string }).text
            return '[non-text content]'
          })
          .join(' ')
      } else {
        content = '[complex content]'
      }
      return `${m.role}: ${content}`
    })
    .join('\n')

  // Build snippet catalog for selection prompt
  const snippetCatalog = snippetIndex
    .map((s) => {
      const hints = s.usageHints.length > 0 ? ` (${s.usageHints[0]})` : ''
      return `- ${s.name}: ${s.description}${hints}`
    })
    .join('\n')

  // Ask cheap model to select relevant snippets
  const selectionPrompt = `Given this conversation context:
---
${recentContext}
---

Which of these snippets (if any) would be useful for the next response? Return a JSON array of snippet names, max ${maxSnippets}. Return [] if none are relevant.

Available snippets:
${snippetCatalog}

Respond with only the JSON array, no explanation. Example: ["snippet_name_1", "snippet_name_2"]`

  try {
    // Use chat to get the selection
    const stream = chat({
      adapter,
      messages: [
        {
          role: 'user',
          content: selectionPrompt,
        },
      ],
    })

    // Collect the full response
    let responseText = ''
    for await (const chunk of stream as AsyncIterable<StreamChunk>) {
      if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
        responseText += chunk.delta
      }
    }

    // Parse the JSON response
    // Handle potential markdown code blocks
    let jsonText = responseText.trim()
    if (jsonText.startsWith('```')) {
      // Remove markdown code block
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    const selectedNames: Array<string> = JSON.parse(jsonText)

    if (!Array.isArray(selectedNames)) {
      return []
    }

    // Load full snippet data for selected snippets
    const selectedSnippets = await Promise.all(
      selectedNames.slice(0, maxSnippets).map((name) => storage.get(name)),
    )

    return selectedSnippets.filter((s): s is Snippet => s !== null)
  } catch (error) {
    // If parsing fails or any error occurs, return empty (safe fallback)
    console.warn('Snippet selection failed, returning empty selection:', error)
    return []
  }
}
