<script lang="ts">
  import { getUIContext, listInterrupts, type UIDescriptor } from './create-ui'
  import UIInterrupt from './ui-interrupt.svelte'
  import type { ChatUIInterrupt } from '@tanstack/ai-client/ui'

  let {
    ui,
    children,
  }: {
    ui: UIDescriptor
    children?: import('svelte').Snippet<[Array<ChatUIInterrupt>]>
  } = $props()

  const ctx = $derived(getUIContext(ui))
  const interrupts = $derived(listInterrupts(ctx))
</script>

{#if children}
  {@render children(interrupts)}
{:else}
  {#each interrupts as interrupt (interrupt.id)}
    <UIInterrupt {ui} {interrupt} />
  {/each}
{/if}
