<script setup lang="ts">
import { computed } from 'vue'
import MessagePart from './message-part.vue'
import type { ChatMessageProps } from './types'

const props = defineProps<ChatMessageProps>()

type ChatMessageSlots = {
  text?: (props: { content: string }) => any
  thinking?: (props: { content: string; isComplete?: boolean }) => any
  'tool-default'?: (props: any) => any
  'tool-result'?: (props: {
    toolCallId: string
    content: string
    state: string
  }) => any
} & Partial<Record<`tool-${string}`, (props: any) => any>>

const slots = defineSlots<ChatMessageSlots>()

// Combine classes based on role
const roleClass = computed(() =>
  props.message.role === 'user'
    ? (props.userClass ?? '')
    : (props.assistantClass ?? ''),
)

const combinedClass = computed(() =>
  [props.class ?? '', roleClass.value].filter(Boolean).join(' '),
)

// Check if thinking is complete (if there's a text part after this thinking part)
const isThinkingComplete = (partIndex: number) => {
  const part = props.message.parts[partIndex]
  if (!part || part.type !== 'thinking') return false
  return props.message.parts
    .slice(partIndex + 1)
    .some((p: any) => p.type === 'text')
}
</script>

<template>
  <div
    :class="combinedClass || undefined"
    :data-message-id="message.id"
    :data-message-role="message.role"
    :data-message-created="message.createdAt?.toISOString()"
  >
    <component
      :is="MessagePart"
      v-for="(part, index) in message.parts"
      :key="index"
      :part="part"
      :is-thinking-complete="isThinkingComplete(index)"
    >
      <template v-if="slots.text" #text="slotProps">
        <slot name="text" v-bind="slotProps" />
      </template>
      <template v-if="slots.thinking" #thinking="slotProps">
        <slot name="thinking" v-bind="slotProps" />
      </template>
      <template v-if="slots['tool-default']" #tool-default="slotProps">
        <slot name="tool-default" v-bind="slotProps" />
      </template>
      <template v-if="slots['tool-result']" #tool-result="slotProps">
        <slot name="tool-result" v-bind="slotProps" />
      </template>
      <!-- Forward dynamic tool slot if it exists -->
      <template
        v-if="part.type === 'tool-call' && slots[`tool-${part.name}`]"
        #[`tool-${part.name}`]="slotProps"
      >
        <slot :name="`tool-${part.name}`" v-bind="slotProps" />
      </template>
    </component>
  </div>
</template>
