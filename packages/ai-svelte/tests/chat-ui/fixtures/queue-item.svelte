<script lang="ts">
  let { item }: { item: { content: unknown; cancelQueued: () => void } } =
    $props()
  item.cancelQueued()
</script>

<em>{typeof item.content === 'string' ? item.content : ''}</em>
