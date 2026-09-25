<script lang="ts">
  import {
    getChatContext,
    getComponentsContext,
    readQueue,
    type UIDescriptor,
  } from './create-ui'

  let { ui }: { ui: UIDescriptor } = $props()

  const chat = $derived(getChatContext(ui))
  const comps = $derived(getComponentsContext(ui))
  const items = $derived(readQueue(chat))
  const QueueItem = $derived(comps.components.queue as any)
</script>

{#if QueueItem}
  {#each items as item (item.id)}
    <QueueItem {item} />
  {/each}
{/if}
