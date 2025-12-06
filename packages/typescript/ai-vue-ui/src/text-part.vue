<script setup lang="ts">
import { computed } from 'vue'
import { VueMarkdown } from '@crazydos/vue-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import type { TextPartProps } from './types'

const props = defineProps<TextPartProps>()

// Combine classes based on role
const roleClass = computed(() =>
  props.role === 'user'
    ? props.userClass ?? ''
    : props.role === 'assistant'
      ? props.assistantClass ?? ''
      : '',
)

const combinedClass = computed(() =>
  [props.class ?? '', roleClass.value].filter(Boolean).join(' '),
)
</script>

<template>
  <div :class="combinedClass || undefined">
    <VueMarkdown
      :markdown="content"
      :remark-plugins="[remarkGfm]"
      :rehype-plugins="[rehypeRaw, rehypeSanitize, rehypeHighlight]"
      sanitize
    />
  </div>
</template>
