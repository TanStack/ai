<script lang="ts">
  let {
    part,
  }: {
    part: { input?: { city?: string } }
  } = $props()
</script>

<strong>{part.input?.city}</strong>
