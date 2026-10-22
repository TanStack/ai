<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { marked } from 'marked'
import type { UIMessage } from '@tanstack/ai-client'
import ThinkingPart from './ThinkingPart.vue'
import GuitarRecommendation from './GuitarRecommendation.vue'

// Using readonly any[] to accept deep readonly messages from useChat
const props = defineProps<{
  messages: readonly any[]
}>()

const containerRef = ref<HTMLDivElement>()

// Auto-scroll to bottom when messages change
watch(
  () => props.messages,
  async () => {
    await nextTick()
    if (containerRef.value) {
      containerRef.value.scrollTop = containerRef.value.scrollHeight
    }
  },
  { deep: true },
)

const renderMarkdown = (content: string) => {
  return marked(content, { async: false }) as string
}

const isThinkingComplete = (message: UIMessage, partIndex: number) => {
  return message.parts.slice(partIndex + 1).some((p) => p.type === 'text')
}
</script>

<template>
  <div
    v-if="messages.length"
    ref="containerRef"
    class="flex-1 overflow-y-auto px-4 py-4"
  >
    <div
      v-for="message in messages"
      :key="message.id"
      :class="[
        'p-4 rounded-lg mb-2',
        message.role === 'assistant'
          ? 'bg-gradient-to-r from-orange-500/5 to-red-600/5'
          : 'bg-transparent',
      ]"
    >
      <div class="flex items-start gap-4">
        <!-- Avatar -->
        <div
          v-if="message.role === 'assistant'"
          class="w-8 h-8 rounded-lg bg-gradient-to-r from-orange-500 to-red-600 flex items-center justify-center text-sm font-medium text-white shrink-0"
        >
          AI
        </div>
        <div
          v-else
          class="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center text-sm font-medium text-white shrink-0"
        >
          U
        </div>

        <!-- Message content -->
        <div class="flex-1 min-w-0">
          <template v-for="(part, index) in message.parts" :key="index">
            <!-- Thinking part -->
            <div v-if="part.type === 'thinking'" class="mt-2 mb-2">
              <ThinkingPart
                :content="part.content"
                :is-complete="isThinkingComplete(message, index)"
              />
            </div>

            <!-- Text part -->
            <div
              v-else-if="part.type === 'text' && part.content"
              class="text-white prose max-w-none"
              v-html="renderMarkdown(part.content)"
            />

            <!-- Guitar recommendation -->
            <div
              v-else-if="
                part.type === 'tool-call' &&
                part.name === 'recommendGuitar' &&
                part.output
              "
              class="mt-2"
            >
              <GuitarRecommendation :id="part.output?.id" />
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
