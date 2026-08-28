<script lang="ts">
  import {
    getComponentsContext,
    partComponent,
    toolComponent,
    type UIDescriptor,
  } from './create-ui'
  import type { ChatUISelectedPart } from '@tanstack/ai-client/ui'

  let {
    ui,
    selected,
  }: {
    ui: UIDescriptor
    selected: ChatUISelectedPart
  } = $props()

  const comps = $derived(getComponentsContext(ui))
</script>

{#if selected.key === 'toolCall'}
  {@const Tool = toolComponent(comps.components, selected.part.name) as any}
  {#if Tool}
    <Tool
      part={selected.part}
      result={selected.result}
      interrupt={selected.interrupt}
    />
  {:else}
    {comps.warn(
      `tool:${selected.part.name}`,
      `[tanstack-ai-ui] Missing tools.${selected.part.name} component`,
    )}
  {/if}
{:else}
  {@const Part = partComponent(comps.components, selected.key) as any}
  {#if Part}
    <Part part={selected.part} />
  {:else}
    {comps.warn(
      `part:${selected.key}`,
      `[tanstack-ai-ui] Missing parts.${selected.key} component`,
    )}
  {/if}
{/if}
