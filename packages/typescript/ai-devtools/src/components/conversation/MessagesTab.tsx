import { For, Show } from 'solid-js'
import { useStyles } from '../../styles/use-styles'
import { MessageCard } from './MessageCard'
import type { Component } from 'solid-js'
import type { Message } from '../../store/ai-store'

interface MessagesTabProps {
  messages: Array<Message>
}

export const MessagesTab: Component<MessagesTabProps> = (props) => {
  const styles = useStyles()

  return (
    <Show
      when={props.messages.length > 0}
      fallback={
        <div class={styles().conversationDetails.emptyMessages}>
          No messages yet. Start a conversation to see messages here.
        </div>
      }
    >
      <div class={styles().conversationDetails.messagesList}>
        <For each={props.messages}>
          {(msg) => <MessageCard message={msg} />}
        </For>
      </div>
    </Show>
  )
}
