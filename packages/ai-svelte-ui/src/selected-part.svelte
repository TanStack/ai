<script lang="ts">
  import {
    getUIContext,
    inlineNames,
    interruptComponent,
    partComponent,
    toolComponent,
    type UIDescriptor,
  } from './create-ui'
  import type { ChatUISelectedPart } from '@tanstack/ai-client/ui'

  let {
    ui,
    selected,
    inline = false,
  }: {
    ui: UIDescriptor
    selected: ChatUISelectedPart
    inline?: boolean
  } = $props()

  const ctx = $derived(getUIContext(ui))
</script>

{#if selected.key === 'toolCall'}
  {@const Tool = toolComponent(ctx, selected.part.name) as any}
  {#if Tool}
    {@const Interrupt = (
      selected.interrupt
        ? interruptComponent(ctx, selected.interrupt)
        : undefined
    ) as any}
    <Tool
      chat={ctx.chat}
      part={selected.part}
      result={selected.result}
      interrupt={selected.interrupt}
    >
      {#snippet renderInterrupt()}
        {#if inline && selected.interrupt?.kind === 'tool-approval' && Interrupt && inlineNames(ctx.components).includes(selected.interrupt.toolName)}
          <Interrupt chat={ctx.chat} interrupt={selected.interrupt} />
        {/if}
      {/snippet}
    </Tool>
  {:else}
    {ctx.ui.warn(
      `tool:${selected.part.name}`,
      `[tanstack-ai-ui] Missing tools.${selected.part.name} component`,
    )}
  {/if}
{:else}
  {@const Part = partComponent(ctx, selected.key) as any}
  {#if Part}
    <Part chat={ctx.chat} part={selected.part} />
  {:else}
    {ctx.ui.warn(
      `part:${selected.key}`,
      `[tanstack-ai-ui] Missing parts.${selected.key} component`,
    )}
  {/if}
{/if}
