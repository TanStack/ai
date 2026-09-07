<script setup lang="ts">
import { computed } from 'vue'
import { renderHtml } from '@tanstack/markdown/html'
import { streamingMarkdownExtension } from '@tanstack/markdown/extensions/streaming'
import type { MarkdownExtension } from '@tanstack/markdown'
import type { TextPartProps } from './types'

const DEFAULT_EXTENSIONS: Array<MarkdownExtension> = [
  streamingMarkdownExtension(),
]

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

// ponytail: TanStack Markdown has no Vue adapter, so render its (escaped)
// HTML string. Walk the AST with renderBlock/renderInline if per-element
// component overrides are ever needed.
const html = computed(() =>
  renderHtml(props.content, {
    extensions: props.extensions
      ? [...DEFAULT_EXTENSIONS, ...props.extensions]
      : DEFAULT_EXTENSIONS,
    frontmatter: false,
    headingIds: false,
    highlighter: props.highlighter,
  }),
)
</script>

<template>
  <div :class="combinedClass || undefined" v-html="html" />
</template>
