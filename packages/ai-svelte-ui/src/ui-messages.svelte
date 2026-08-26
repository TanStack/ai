<script lang="ts">
  import { getUIContext, readMessages, type UIDescriptor } from './create-ui'
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

  const ctx = $derived(getUIContext(ui))
  const messages = $derived(readMessages(ctx.chat))
</script>

{#if children}
  {@render children(messages)}
{:else}
  {#each messages as message (message.id)}
    <UIMessage {ui} {message} />
  {/each}
{/if}
