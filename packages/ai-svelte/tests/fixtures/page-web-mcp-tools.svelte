<script lang="ts">
  import { createChat } from '../../src/create-chat.svelte'
  import { createPageWebMCPTools } from '../../src/create-web-mcp-tools.svelte'
  import type { AnyClientTool, ConnectionAdapter } from '@tanstack/ai-client'

  let {
    connection,
    onTools,
  }: {
    connection: ConnectionAdapter
    onTools: (tools: Array<AnyClientTool>) => void
  } = $props()

  const page = createPageWebMCPTools({
    filter: (tool) => tool.name !== 'blocked',
  })
  createChat({
    connection,
    get tools() {
      return page.tools
    },
  })

  $effect(() => onTools(page.tools))
</script>
