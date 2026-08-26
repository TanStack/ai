<script lang="ts">
  import {
    getUIContext,
    interruptComponent,
    type UIDescriptor,
  } from './create-ui'
  import type { ChatUIInterrupt } from '@tanstack/ai-client/ui'

  let {
    ui,
    interrupt,
  }: {
    ui: UIDescriptor
    interrupt: ChatUIInterrupt
  } = $props()

  const ctx = $derived(getUIContext(ui))
  const Component = $derived(interruptComponent(ctx, interrupt) as any)
</script>

{#if Component}
  <Component chat={ctx.chat} {interrupt} />
{:else}
  {ctx.ui.warn(
    `interrupt:${interrupt.id}`,
    `[tanstack-ai-ui] Missing interrupt component for ${interrupt.kind}`,
  )}
{/if}
