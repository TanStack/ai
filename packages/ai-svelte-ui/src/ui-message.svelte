<script lang="ts">
  import {
    getChatContext,
    getComponentsContext,
    messageParts,
    readInterrupts,
    type UIDescriptor,
  } from './create-ui'
  import SelectedPart from './selected-part.svelte'
  import type { ChatUIInterrupt } from '@tanstack/ai-client/ui'
  import type { UIMessage } from '@tanstack/ai-client'

  let {
    ui,
    message,
    interrupts,
    children,
  }: {
    ui: UIDescriptor
    message: UIMessage
    interrupts?: ReadonlyArray<ChatUIInterrupt>
    children?: import('svelte').Snippet<[unknown]>
  } = $props()

  const comps = $derived(getComponentsContext(ui))
  const resolvedInterrupts = $derived(
    interrupts ?? readInterrupts(getChatContext(ui)),
  )
  const selectedParts = $derived(
    messageParts(message, resolvedInterrupts, comps.inlineToolNames),
  )
  const Message = $derived(comps.components.message as any)
</script>

{#if children}
  {@render children(selectedParts)}
{:else}
  <Message {message}>
    {#snippet parts()}
      {#each selectedParts as part, index (`${message.id}-${index}`)}
        <SelectedPart {ui} selected={part} />
      {/each}
    {/snippet}
  </Message>
{/if}
