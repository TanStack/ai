<script lang="ts">
  import { toolDefinition } from '@tanstack/ai/client'
  import { createRegisterWebMCPTools } from '../../src/create-web-mcp-tools.svelte'

  let { onError }: { onError?: (error: unknown) => void } = $props()

  const statusTool = toolDefinition({
    name: 'status',
    description: 'Get the current status',
  }).client(async () => ({ ok: true }))

  createRegisterWebMCPTools([statusTool], {
    onError(error) {
      onError?.(error)
    },
  })
</script>
