<script lang="ts">
  let {
    part,
  }: {
    part: { type: string }
  } = $props()
</script>

<span>{part.type}</span>
