<script setup lang="ts">
import { provide } from 'vue'
import { useChat } from '@tanstack/ai-vue'
import { CHAT_KEY } from './use-chat-context'
import type { UIMessage } from '@tanstack/ai-vue'
import type { ChatProps } from './types'

const props = defineProps<ChatProps>()

const emit = defineEmits<{
  response: [response?: Response]
  chunk: [chunk: unknown]
  finish: [message: UIMessage]
  error: [error: Error]
}>()

defineSlots<{
  default: () => unknown
}>()

const chat = useChat({
  connection: props.connection,
  ...(props.initialMessages !== undefined && {
    initialMessages: props.initialMessages,
  }),
  ...(props.id !== undefined && { id: props.id }),
  body: props.body,
  onResponse: (response?: Response) => emit('response', response),
  onChunk: (chunk: any) => emit('chunk', chunk),
  onFinish: (message: UIMessage) => emit('finish', message),
  onError: (error: Error) => emit('error', error),
  ...(props.tools !== undefined && { tools: props.tools }),
})

provide(CHAT_KEY, chat)
</script>

<template>
  <div :class data-chat-root>
    <slot />
  </div>
</template>
