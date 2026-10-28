<script lang="ts">
  let {
    part,
    interrupt,
  }: {
    part: {
      input?: { guitarId?: string; id?: string | number }
      output?: { preference?: string }
    }
    interrupt?: {
      status?: string
      resolveInterrupt?: (value: boolean) => void
    }
  } = $props()
</script>

<p>
  {part.output?.preference ?? part.input?.guitarId ?? part.input?.id ?? ''}
  {#if interrupt?.status === 'pending'}
    <button type="button" onclick={() => interrupt.resolveInterrupt?.(true)}>
      Approve
    </button>
  {/if}
</p>
