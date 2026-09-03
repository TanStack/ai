<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    message,
    parts,
  }: {
    message: { role: string }
    parts?: Snippet
  } = $props()
</script>

<article class="mb-2 p-4" data-role={message.role}>
  {@render parts?.()}
</article>
