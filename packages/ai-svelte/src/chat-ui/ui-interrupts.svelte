<script lang="ts">
  import {
    getChatContext,
    getComponentsContext,
    listInterrupts,
    type UIDescriptor,
  } from './create-ui'
  import UIInterrupt from './ui-interrupt.svelte'
  import type { ChatUIInterrupt } from '@tanstack/ai-client/ui'

  let {
    ui,
    children,
  }: {
    ui: UIDescriptor
    children?: import('svelte').Snippet<[Array<ChatUIInterrupt>]>
  } = $props()

  const chat = $derived(getChatContext(ui))
  const comps = $derived(getComponentsContext(ui))
  const interrupts = $derived(listInterrupts(chat, comps.inlineToolNames))
</script>

{#if children}
  {@render children(interrupts)}
{:else}
  {#each interrupts as interrupt (interrupt.id)}
    <UIInterrupt {ui} {interrupt} />
  {/each}
{/if}
