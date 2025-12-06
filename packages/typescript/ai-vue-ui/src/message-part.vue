<script setup lang="ts">
import { computed } from 'vue'
import ThinkingPart from './thinking-part.vue'
import type { ToolCallRenderProps } from './types'

interface MessagePartProps {
  part: any
  isThinkingComplete?: boolean
}

const props = defineProps<MessagePartProps>()

defineSlots<{
  text?: (props: { content: string }) => any
  thinking?: (props: { content: string; isComplete?: boolean }) => any
  'tool-default'?: (props: ToolCallRenderProps) => any
  'tool-result'?: (props: {
    toolCallId: string
    content: string
    state: string
  }) => any
  // Dynamic slots for named tools will be accessed via $slots[`tool-${toolName}`]
}>()

const toolProps = computed<ToolCallRenderProps | null>(() => {
  if (props.part.type === 'tool-call') {
    return {
      id: props.part.id,
      name: props.part.name,
      arguments: props.part.arguments,
      state: props.part.state,
      approval: props.part.approval,
      output: props.part.output,
    }
  }
  return null
})
</script>

<template>
  <!-- Text part -->
  <div v-if="part.type === 'text'">
    <slot
      v-if="$slots.text"
      name="text"
      :content="part.content"
    />
    <div v-else data-part-type="text" data-part-content>
      {{ part.content }}
    </div>
  </div>

  <!-- Thinking part -->
  <div v-else-if="part.type === 'thinking'">
    <slot
      v-if="$slots.thinking"
      name="thinking"
      :content="part.content"
      :is-complete="isThinkingComplete"
    />
    <ThinkingPart
      v-else
      :content="part.content"
      :is-complete="isThinkingComplete"
    />
  </div>

  <!-- Tool call part -->
  <div
    v-else-if="part.type === 'tool-call' && toolProps"
    data-part-type="tool-call"
    :data-tool-name="part.name"
    :data-tool-state="part.state"
    :data-tool-id="part.id"
  >
    <!-- Check for named tool slot first -->
    <slot
      v-if="$slots[`tool-${part.name}`]"
      :name="`tool-${part.name}`"
      v-bind="toolProps"
    />
    <!-- Default tool slot -->
    <slot
      v-else-if="$slots['tool-default']"
      name="tool-default"
      v-bind="toolProps"
    />
    <!-- Fallback to built-in default renderer -->
    <template v-else>
      <div data-tool-header>
        <strong>{{ part.name }}</strong>
        <span data-tool-state-badge>{{ part.state }}</span>
      </div>
      <div v-if="part.arguments" data-tool-arguments>
        <pre>{{ part.arguments }}</pre>
      </div>
      <div v-if="part.approval" data-tool-approval>
        {{
          part.approval.approved !== undefined
            ? part.approval.approved
              ? '✓ Approved'
              : '✗ Denied'
            : '⏳ Awaiting approval...'
        }}
      </div>
      <div v-if="part.output" data-tool-output>
        <pre>{{ JSON.stringify(part.output, null, 2) }}</pre>
      </div>
    </template>
  </div>

  <!-- Tool result part -->
  <div
    v-else-if="part.type === 'tool-result'"
    data-part-type="tool-result"
    :data-tool-call-id="part.toolCallId"
    :data-tool-result-state="part.state"
  >
    <slot
      v-if="$slots['tool-result']"
      name="tool-result"
      :tool-call-id="part.toolCallId"
      :content="part.content"
      :state="part.state"
    />
    <div v-else data-tool-result-content>{{ part.content }}</div>
  </div>
</template>
