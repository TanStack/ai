<script setup lang="ts">
import { computed } from 'vue'
import { VueMarkdown } from '@crazydos/vue-markdown'
import { resolveMarkdownPlugins } from './markdown-plugins'
import type { TextPartProps } from './types'

const props = defineProps<TextPartProps>()

// Combine classes based on role
const roleClass = computed(() =>
  props.role === 'user'
    ? (props.userClass ?? '')
    : props.role === 'assistant'
      ? (props.assistantClass ?? '')
      : '',
)

const combinedClass = computed(() =>
  [props.class ?? '', roleClass.value].filter(Boolean).join(' '),
)

const resolved = computed(() =>
  resolveMarkdownPlugins({
    remarkPlugins: props.remarkPlugins,
    rehypePlugins: props.rehypePlugins,
    disableDefaultPlugins: props.disableDefaultPlugins,
  }),
)

// @crazydos/vue-markdown applies rehype-sanitize automatically when `sanitize`
// is true. Disabling defaults also disables sanitize so the caller owns the
// chain.
const sanitize = computed(() => !props.disableDefaultPlugins)
</script>

<template>
  <div :class="combinedClass || undefined">
    <VueMarkdown
      :markdown="content"
      :remark-plugins="resolved.remarkPlugins"
      :rehype-plugins="resolved.rehypePlugins"
      :sanitize="sanitize"
    />
  </div>
</template>
