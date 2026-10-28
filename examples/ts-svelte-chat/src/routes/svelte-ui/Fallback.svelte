<script lang="ts">
  let { part }: { part: { type: string; content?: string } } = $props()
</script>

{#if part.type === 'text'}
  <p>{part.content}</p>
{/if}
