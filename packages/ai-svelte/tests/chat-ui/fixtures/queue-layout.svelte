<script lang="ts">
  let {
    queue,
  }: {
    queue?: import('svelte').Snippet
  } = $props()
</script>

{@render queue?.()}
