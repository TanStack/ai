<script lang="ts">
  import { getUIContext, type UIDescriptor } from './create-ui'
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

  const ctx = $derived(getUIContext(ui))
  const selected = $derived(
    selectMessageUI(
      { id: 'part', role: 'assistant', parts: [part] },
      { interrupts: ctx.chat.interrupts ?? [], inlineToolNames: [] },
    ).parts[0],
  )
</script>

{#if selected}
  <SelectedPart {ui} {selected} inline={false} />
{/if}
