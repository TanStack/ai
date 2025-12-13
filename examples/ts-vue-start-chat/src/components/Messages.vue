<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { marked } from 'marked'
import type { UIMessage } from '@tanstack/ai-client'
import { ThinkingPart } from '@tanstack/ai-vue-ui'
import GuitarRecommendation from './GuitarRecommendation.vue'

// Using readonly any[] to accept deep readonly messages from useChat
const props = defineProps<{
  messages: readonly any[]
}>()

const emit = defineEmits<{
  approve: [{ id: string; approved: boolean }]
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
                class="p-4 bg-gray-800/50 border border-gray-700/50 rounded-lg"
              />
            </div>

            <!-- Text part -->
            <div
              v-else-if="part.type === 'text' && part.content"
              class="text-white prose max-w-none"
              v-html="renderMarkdown(part.content)"
            />

            <!-- Approval UI -->
            <div
              v-else-if="
                part.type === 'tool-call' &&
                part.state === 'approval-requested' &&
                part.approval
              "
              class="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mt-2"
            >
              <p class="text-white font-medium mb-2">
                🔒 Approval Required: {{ part.name }}
              </p>
              <div class="text-gray-300 text-sm mb-3">
                <pre class="bg-gray-800 p-2 rounded text-xs overflow-x-auto">{{
                  JSON.stringify(JSON.parse(part.arguments), null, 2)
                }}</pre>
              </div>
              <div class="flex gap-2">
                <button
                  @click="
                    emit('approve', { id: part.approval!.id, approved: true })
                  "
                  class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  ✓ Approve
                </button>
                <button
                  @click="
                    emit('approve', { id: part.approval!.id, approved: false })
                  "
                  class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  ✗ Deny
                </button>
              </div>
            </div>

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
