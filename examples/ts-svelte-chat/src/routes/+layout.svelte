<script lang="ts">
  import '../app.css'
  import Header from '$lib/components/Header.svelte'

  let { children } = $props()
</script>

<div class="flex flex-col h-screen bg-gray-900">
  <Header />
  {@render children()}
</div>
