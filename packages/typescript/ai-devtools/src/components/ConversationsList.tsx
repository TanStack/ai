import { For } from 'solid-js'
import { useStyles } from '../styles/use-styles'
import { useAIStore } from '../store/ai-context'
import { ConversationRow } from './list'
import type { Conversation } from '../store/ai-context'
import type { Component } from 'solid-js'

export const ConversationsList: Component = () => {
  const { state } = useAIStore()
  const styles = useStyles()

  const conversations = () => Object.values(state.conversations)

  return (
    <div class={styles().utilList}>
      <For each={conversations()}>
        {(conv: Conversation) => <ConversationRow conversation={conv} />}
      </For>
    </div>
  )
}
