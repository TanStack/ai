<script setup lang="ts">
import { computed } from 'vue'
import { useChatContext } from './use-chat-context'
import type { ToolApprovalProps, ToolApprovalRenderProps } from './types'

const props = defineProps<ToolApprovalProps>()

const emit = defineEmits<{
  approve: []
  deny: []
}>()

defineSlots<{
  default?: (props: ToolApprovalRenderProps) => any
}>()

const { addToolApprovalResponse } = useChatContext()

const handleApprove = () => {
  addToolApprovalResponse({
    id: props.approval.id,
    approved: true,
  })
  emit('approve')
}

const handleDeny = () => {
  addToolApprovalResponse({
    id: props.approval.id,
    approved: false,
  })
  emit('deny')
}

const hasResponded = computed(() => props.approval.approved !== undefined)

const slotProps = computed<ToolApprovalRenderProps>(() => ({
  toolName: props.toolName,
  input: props.input,
  onApprove: handleApprove,
  onDeny: handleDeny,
  hasResponded: hasResponded.value,
  approved: props.approval.approved,
}))
</script>

<template>
  <!-- Scoped slot for custom UI -->
  <slot v-if="$slots.default" v-bind="slotProps" />

  <!-- Already responded - show decision -->
  <div
    v-else-if="hasResponded"
    :class
    data-tool-approval
    :data-approval-status="approval.approved ? 'approved' : 'denied'"
  >
    {{ approval.approved ? '✓ Approved' : '✗ Denied' }}
  </div>

  <!-- Default approval UI -->
  <div v-else :class data-tool-approval data-approval-status="pending">
    <div data-approval-header>
      <strong>{{ toolName }}</strong> requires approval
    </div>
    <div data-approval-input>
      <pre>{{ JSON.stringify(input, null, 2) }}</pre>
    </div>
    <div data-approval-actions>
      <button @click="handleApprove" data-approval-approve>Approve</button>
      <button @click="handleDeny" data-approval-deny>Deny</button>
    </div>
  </div>
</template>
