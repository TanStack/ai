import { For, Show, createMemo } from 'solid-js'
import { useAIStore } from '../../store/ai-context'
import { useStyles } from '../../styles/use-styles'
import type { SkillsSnapshot } from '../../store/skills-registry'
import type { Message } from '../../store/ai-store'
import type { Component } from 'solid-js'

function parseSkillName(argumentsJson: string | undefined): string | undefined {
  if (!argumentsJson) return undefined
  try {
    const parsed: unknown = JSON.parse(argumentsJson)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'name' in parsed &&
      typeof parsed.name === 'string'
    ) {
      return parsed.name
    }
  } catch {
    return undefined
  }
  return undefined
}

function loadedFromMessages(messages: Array<Message>): Array<string> {
  const names = new Set<string>()
  for (const message of messages) {
    for (const toolCall of message.toolCalls ?? []) {
      if (toolCall.name === 'load_skill') {
        const name = parseSkillName(toolCall.arguments)
        if (name) names.add(name)
      }
    }
    for (const part of message.parts ?? []) {
      if (part.type === 'tool-call') {
        if (part.toolName === 'load_skill') {
          const name = parseSkillName(part.arguments)
          if (name) names.add(name)
        }
      }
    }
  }
  return [...names]
}

export const SkillsPanel: Component = () => {
  const { state } = useAIStore()
  const styles = useStyles()

  const snapshot = createMemo((): SkillsSnapshot | undefined => {
    const hookId = state.hooks.activeHookId
    if (hookId && state.skills.snapshots[hookId]) {
      return state.skills.snapshots[hookId]
    }
    const first = Object.values(state.skills.snapshots)[0]
    return first
  })

  const conversation = createMemo(() => {
    const hookId = state.hooks.activeHookId
    if (!hookId) return undefined
    return state.conversations[hookId]
  })

  const loaded = createMemo(() => {
    const fromSnap = new Set(snapshot()?.activated ?? [])
    const loadedNames = loadedFromMessages(conversation()?.messages ?? [])
    for (const name of loadedNames) {
      fromSnap.add(name)
    }
    return fromSnap
  })

  const catalog = createMemo(() => snapshot()?.catalog ?? [])

  return (
    <div
      class={styles().memoryPanel.container}
      data-testid="ai-devtools-skills-panel"
    >
      <Show
        when={catalog().length > 0 || loaded().size > 0}
        fallback={
          <div class={styles().memoryPanel.empty}>
            No skills on this run. Add `withSkills(...)` to `chat()` and the
            catalog will appear here. A skill lights up when the model calls
            `load_skill`.
          </div>
        }
      >
        <div class={styles().memoryPanel.section}>
          <div class={styles().memoryPanel.sectionTitle}>Catalog</div>
          <Show
            when={catalog().length > 0}
            fallback={
              <div class={styles().memoryPanel.sectionEmpty}>
                Loaded via `load_skill`, but the catalog snapshot has not
                arrived yet.
              </div>
            }
          >
            <ul class={styles().memoryPanel.list}>
              <For each={catalog()}>
                {(skill) => {
                  const isLoaded = () => loaded().has(skill.name)
                  return (
                    <li class={styles().memoryPanel.row}>
                      <span class={styles().memoryPanel.badge}>
                        {skill.name}
                      </span>
                      <Show when={isLoaded()}>
                        <span class={styles().memoryPanel.badge}>loaded</span>
                      </Show>
                      <span class={styles().memoryPanel.sectionEmpty}>
                        {skill.description}
                      </span>
                    </li>
                  )
                }}
              </For>
            </ul>
          </Show>
        </div>
      </Show>
    </div>
  )
}
