<script lang="ts">
  let {
    parts,
  }: {
    parts?: import('svelte').Snippet
  } = $props()
</script>

<article>{@render parts?.()}</article>
