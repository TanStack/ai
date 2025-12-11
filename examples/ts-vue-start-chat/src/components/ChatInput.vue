<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  isLoading: boolean
}>()

const emit = defineEmits<{
  send: [message: string]
  stop: []
}>()

const input = ref('')
const textareaRef = ref<HTMLTextAreaElement>()

const handleSend = () => {
  if (input.value.trim() && !props.isLoading) {
    emit('send', input.value)
    input.value = ''
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto'
    }
  }
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey && input.value.trim()) {
    e.preventDefault()
    handleSend()
  }
}

const handleInput = () => {
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto'
    textareaRef.value.style.height =
      Math.min(textareaRef.value.scrollHeight, 200) + 'px'
  }
}
</script>

<template>
  <div class="border-t border-orange-500/10 bg-gray-900/80 backdrop-blur-sm">
    <div class="w-full px-4 py-3">
      <div class="space-y-3">
        <div v-if="isLoading" class="flex items-center justify-center">
          <button
            @click="emit('stop')"
            class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" />
            </svg>
            Stop
          </button>
        </div>
        <div class="relative">
          <textarea
            ref="textareaRef"
            v-model="input"
            @keydown="handleKeydown"
            @input="handleInput"
            placeholder="Type something clever (or don't, we won't judge)..."
            class="w-full rounded-lg border border-orange-500/20 bg-gray-800/50 pl-4 pr-12 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-transparent resize-none overflow-hidden shadow-lg"
            rows="1"
            :disabled="isLoading"
            :style="{ minHeight: '44px', maxHeight: '200px' }"
          ></textarea>
          <button
            @click="handleSend"
            :disabled="!input.trim() || isLoading"
            class="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-orange-500 hover:text-orange-400 disabled:text-gray-500 transition-colors focus:outline-none"
          >
            <svg
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
