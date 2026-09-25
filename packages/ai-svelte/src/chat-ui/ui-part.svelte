<script lang="ts">
  import {
    getChatContext,
    readInterrupts,
    type UIDescriptor,
  } from './create-ui'
  import { selectMessageUI } from '@tanstack/ai-client/ui'
  import SelectedPart from './selected-part.svelte'
  import type { MessagePart } from '@tanstack/ai-client'

  let {
    ui,
    part,
  }: {
    ui: UIDescriptor
    part: MessagePart
  } = $props()

  const chat = $derived(getChatContext(ui))
  const selected = $derived(
    selectMessageUI(
      { id: 'part', role: 'assistant', parts: [part] },
      { interrupts: readInterrupts(chat), inlineToolNames: [] },
    ).parts[0],
  )
</script>

{#if selected}
  <SelectedPart {ui} {selected} />
{/if}
