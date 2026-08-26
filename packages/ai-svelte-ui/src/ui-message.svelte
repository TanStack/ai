<script lang="ts">
  import { getUIContext, messageParts, type UIDescriptor } from './create-ui'
  import SelectedPart from './selected-part.svelte'
  import type { UIMessage } from '@tanstack/ai-client'

  let {
    ui,
    message,
    children,
  }: {
    ui: UIDescriptor
    message: UIMessage
    children?: import('svelte').Snippet<[unknown]>
  } = $props()

  const ctx = $derived(getUIContext(ui))
  const selectedParts = $derived(messageParts(ctx, message))
  const Message = $derived(ctx.components.message as any)
</script>

{#if children}
  {@render children(selectedParts)}
{:else}
  <Message chat={ctx.chat} {message}>
    {#snippet parts()}
      {#each selectedParts as part, index (`${message.id}-${index}`)}
        <SelectedPart {ui} selected={part} inline />
      {/each}
    {/snippet}
  </Message>
{/if}
