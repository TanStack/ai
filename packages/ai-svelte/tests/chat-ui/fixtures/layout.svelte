<script lang="ts">
  let {
    messages,
  }: {
    messages?: import('svelte').Snippet
  } = $props()
</script>

{@render messages?.()}
