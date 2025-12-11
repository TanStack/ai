<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  content: string
  isComplete: boolean
}>()

const isExpanded = ref(false)

const displayContent = computed(() => {
  if (isExpanded.value) {
    return props.content
  }
  // Show first 150 characters when collapsed
  if (props.content.length > 150) {
    return props.content.substring(0, 150) + '...'
  }
  return props.content
})
</script>

<template>
  <div class="p-4 bg-gray-800/50 border border-gray-700/50 rounded-lg">
    <div class="flex items-center gap-2 mb-2">
      <div v-if="!isComplete" class="animate-pulse flex items-center gap-1">
        <span class="w-2 h-2 bg-orange-500 rounded-full"></span>
        <span
          class="w-2 h-2 bg-orange-500 rounded-full animation-delay-200"
        ></span>
        <span
          class="w-2 h-2 bg-orange-500 rounded-full animation-delay-400"
        ></span>
      </div>
      <span class="text-sm text-gray-400 font-medium">
        {{ isComplete ? '💭 Thought Process' : '💭 Thinking...' }}
      </span>
    </div>
    <div class="text-sm text-gray-300 whitespace-pre-wrap">
      {{ displayContent }}
    </div>
    <button
      v-if="content.length > 150"
      @click="isExpanded = !isExpanded"
      class="mt-2 text-xs text-orange-400 hover:text-orange-300"
    >
      {{ isExpanded ? 'Show less' : 'Show more' }}
    </button>
  </div>
</template>

<style scoped>
.animation-delay-200 {
  animation-delay: 0.2s;
}
.animation-delay-400 {
  animation-delay: 0.4s;
}
</style>
