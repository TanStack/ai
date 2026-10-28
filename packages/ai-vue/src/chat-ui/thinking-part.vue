<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ThinkingPartProps } from './types'

const props = defineProps<ThinkingPartProps>()

const isCollapsed = ref(false)

// Auto-collapse when thinking completes
watch(
  () => props.isComplete,
  (complete) => {
    if (complete) {
      isCollapsed.value = true
    }
  },
)
</script>

<template>
  <div :class data-part-type="thinking" data-part-content>
    <button
      @click="isCollapsed = !isCollapsed"
      class="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-300 transition-colors mb-2"
      :aria-expanded="!isCollapsed"
      :aria-label="isCollapsed ? 'Expand thinking' : 'Collapse thinking'"
    >
      <span class="text-xs">{{ isCollapsed ? '▶' : '▼' }}</span>
      <span class="italic">💭 Thinking...</span>
      <span v-if="isComplete" class="text-xs text-gray-500">(complete)</span>
    </button>
    <div
      v-if="!isCollapsed"
      class="text-gray-300 whitespace-pre-wrap font-mono text-sm"
    >
      {{ content }}
    </div>
  </div>
</template>
