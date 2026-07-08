import { chat } from '@tanstack/ai'
import type { AnyTextAdapter, ModelMessage, StreamChunk } from '@tanstack/ai'
import type { Skill, SkillIndexEntry, SkillStorage } from './types'

interface SelectRelevantSkillsOptions {
  /**
   * Text adapter for skill selection (should be a cheap/fast model)
   */
  adapter: AnyTextAdapter

  /**
   * Current conversation messages
   */
  messages: Array<ModelMessage>

  /**
   * Skill index (lightweight metadata)
   */
  skillIndex: Array<SkillIndexEntry>

  /**
   * Maximum number of skills to select
   */
  maxSkills: number

  /**
   * Storage to load full skill data
   */
  storage: SkillStorage
}

/**
 * Use a cheap/fast LLM to select which skills are relevant for the current conversation
 */
export async function selectRelevantSkills({
  adapter,
  messages,
  skillIndex,
  maxSkills,
  storage,
}: SelectRelevantSkillsOptions): Promise<Array<Skill>> {
  // Early exit conditions
  if (skillIndex.length === 0) return []
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

  // Build skill catalog for selection prompt
  const skillCatalog = skillIndex
    .map((s) => {
      const hints = s.usageHints.length > 0 ? ` (${s.usageHints[0]})` : ''
      return `- ${s.name}: ${s.description}${hints}`
    })
    .join('\n')

  // Ask cheap model to select relevant skills
  const selectionPrompt = `Given this conversation context:
---
${recentContext}
---

Which of these skills (if any) would be useful for the next response? Return a JSON array of skill names, max ${maxSkills}. Return [] if none are relevant.

Available skills:
${skillCatalog}

Respond with only the JSON array, no explanation. Example: ["skill_name_1", "skill_name_2"]`

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

    // Load full skill data for selected skills
    const selectedSkills = await Promise.all(
      selectedNames.slice(0, maxSkills).map((name) => storage.get(name)),
    )

    return selectedSkills.filter((s): s is Skill => s !== null)
  } catch (error) {
    // If parsing fails or any error occurs, return empty (safe fallback)
    console.warn('Skill selection failed, returning empty selection:', error)
    return []
  }
}
