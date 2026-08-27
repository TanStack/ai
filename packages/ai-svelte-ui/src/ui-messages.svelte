<script lang="ts">
  import {
    getChatContext,
    readInterrupts,
    readMessages,
    type UIDescriptor,
  } from './create-ui'
  import UIMessage from './ui-message.svelte'
  import type { Snippet } from 'svelte'
  import type { UIMessage as UIMessageModel } from '@tanstack/ai-client'

  let {
    ui,
    children,
  }: {
    ui: UIDescriptor
    children?: Snippet<[ReadonlyArray<UIMessageModel>]>
  } = $props()

  const chat = $derived(getChatContext(ui))
  const messages = $derived(readMessages(chat))
  const interrupts = $derived(readInterrupts(chat))
</script>

{#if children}
  {@render children(messages)}
{:else}
  {#each messages as message (message.id)}
    <UIMessage {ui} {message} {interrupts} />
  {/each}
{/if}
