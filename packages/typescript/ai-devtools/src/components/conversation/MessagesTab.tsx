import { Component, For, Show } from "solid-js";
import { useStyles } from "../../styles/use-styles";
import type { Message } from "../../store/ai-store";
import { MessageCard } from "./MessageCard";

interface MessagesTabProps {
  messages: Message[];
}

export const MessagesTab: Component<MessagesTabProps> = (props) => {
  const styles = useStyles();

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
        <For each={props.messages}>{(msg) => <MessageCard message={msg} />}</For>
      </div>
    </Show>
  );
};
