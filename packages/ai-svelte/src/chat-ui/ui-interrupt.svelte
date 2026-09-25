<script lang="ts">
  import {
    getComponentsContext,
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

  const comps = $derived(getComponentsContext(ui))
  const Component = $derived(
    interruptComponent(comps.components, interrupt) as any,
  )
</script>

{#if Component}
  <Component {interrupt} />
{:else}
  {comps.warn(
    `interrupt:${interrupt.id}`,
    `[tanstack-ai-ui] Missing interrupt component for ${interrupt.kind}`,
  )}
{/if}
