<script setup lang="ts">
import { computed } from 'vue'
import { useChatContext } from './use-chat-context'
import type { ChatInputProps, ChatInputRenderProps } from './types'

const props = withDefaults(defineProps<ChatInputProps>(), {
  placeholder: 'Type a message...',
  submitOnEnter: true,
})

const emit = defineEmits<{
  /** Emitted when the message is submitted */
  submit: [value: string]
}>()

defineSlots<{
  default?: (props: ChatInputRenderProps) => any
}>()

// v-model support - defaults to empty string if not provided
const modelValue = defineModel({ default: '' })

const { sendMessage, isLoading } = useChatContext()

const disabled = computed(() => props.disabled || isLoading.value)

const handleSubmit = () => {
  if (!modelValue.value.trim() || disabled.value) return
  sendMessage(modelValue.value)
  emit('submit', modelValue.value)
  modelValue.value = ''
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (props.submitOnEnter && e.key === 'Enter') {
    e.preventDefault()
    handleSubmit()
  }
}

const slotProps = computed<ChatInputRenderProps>(() => ({
  value: modelValue.value,
  onSubmit: handleSubmit,
  isLoading: isLoading.value,
  disabled: disabled.value,
}))

const buttonBackgroundColor = computed(() => {
  return disabled.value || !modelValue.value.trim()
    ? 'rgba(107, 114, 128, 0.5)'
    : 'rgb(249, 115, 22)'
})

const buttonCursor = computed(() => {
  return disabled.value || !modelValue.value.trim() ? 'not-allowed' : 'pointer'
})

const handleInputFocus = (e: FocusEvent) => {
  const target = e.currentTarget as HTMLInputElement
  target.style.borderColor = 'rgba(249, 115, 22, 0.4)'
  target.style.boxShadow = '0 0 0 2px rgba(249, 115, 22, 0.2)'
}

const handleInputBlur = (e: FocusEvent) => {
  const target = e.currentTarget as HTMLInputElement
  target.style.borderColor = 'rgba(255, 255, 255, 0.1)'
  target.style.boxShadow = 'none'
}

const handleButtonMouseEnter = (e: MouseEvent) => {
  if (!disabled.value && modelValue.value.trim()) {
    ;(e.currentTarget as HTMLButtonElement).style.backgroundColor =
      'rgb(234, 88, 12)'
  }
}

const handleButtonMouseLeave = (e: MouseEvent) => {
  if (!disabled.value && modelValue.value.trim()) {
    ;(e.currentTarget as HTMLButtonElement).style.backgroundColor =
      'rgb(249, 115, 22)'
  }
}
</script>

<template>
  <!-- Scoped slot for custom UI -->
  <slot v-if="$slots.default" v-bind="slotProps" />

  <!-- Default implementation -->
  <div
    v-else
    :class
    data-chat-input
    :style="{
      display: 'flex',
      gap: '0.75rem',
      alignItems: 'center',
      width: '100%',
    }"
  >
    <input
      type="text"
      v-model="modelValue"
      @keydown="handleKeyDown"
      :placeholder
      :disabled
      data-chat-textarea
      :style="{
        flex: 1,
        padding: '0.75rem 1rem',
        fontSize: '0.875rem',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '0.75rem',
        backgroundColor: 'rgba(31, 41, 55, 0.5)',
        color: 'white',
        outline: 'none',
        transition: 'all 0.2s',
      }"
      @focus="handleInputFocus"
      @blur="handleInputBlur"
    />
    <button
      @click="handleSubmit"
      :disabled="disabled || !modelValue.trim()"
      data-chat-submit
      :style="{
        padding: '0.75rem 1.5rem',
        fontSize: '0.875rem',
        fontWeight: 500,
        color: 'white',
        backgroundColor: buttonBackgroundColor,
        border: 'none',
        borderRadius: '0.75rem',
        cursor: buttonCursor,
        transition: 'all 0.2s',
        whiteSpace: 'nowrap',
      }"
      @mouseenter="handleButtonMouseEnter"
      @mouseleave="handleButtonMouseLeave"
    >
      {{ isLoading ? 'Sending...' : 'Send' }}
    </button>
  </div>
</template>
