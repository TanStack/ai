<script lang="ts">
  let {
    messages,
  }: {
    chat?: unknown
    messages?: import('svelte').Snippet
    interrupts?: import('svelte').Snippet
    input?: import('svelte').Snippet
  } = $props()
</script>

{@render messages?.()}
