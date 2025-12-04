<script lang="ts">
  import { page } from '$app/stores'
  import guitars from '$data/example-guitars'

  const guitarId = $derived(parseInt($page.params.guitarId || '0'))
  const guitar = $derived(guitars.find((g) => g.id === guitarId))
</script>

<svelte:head>
  <title>{guitar?.name || 'Guitar'} - TanStack AI</title>
</svelte:head>

<div class="min-h-screen bg-gray-900 text-white p-8">
  <div class="max-w-5xl mx-auto">
    {#if guitar}
      <a
        href="/example/guitars"
        class="text-orange-500 hover:text-orange-400 mb-6 inline-block"
      >
        ← Back to Collection
      </a>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
        <div>
          <img
            src={guitar.image}
            alt={guitar.name}
            class="w-full rounded-lg shadow-2xl"
          />
        </div>
        <div>
          <h1 class="text-4xl font-bold mb-4">{guitar.name}</h1>
          <div class="text-5xl font-bold text-orange-500 mb-6">
            ${guitar.price}
          </div>
          <p class="text-gray-300 mb-6 leading-relaxed">
            {guitar.description}
          </p>
          <button
            class="w-full py-4 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white text-xl font-bold rounded-lg transition-colors shadow-lg"
          >
            Add to Cart
          </button>
        </div>
      </div>
    {:else}
      <div class="text-center py-20">
        <h1 class="text-4xl font-bold mb-4">Guitar Not Found</h1>
        <p class="text-gray-400 mb-8">
          The guitar you're looking for doesn't exist.
        </p>
        <a
          href="/example/guitars"
          class="text-orange-500 hover:text-orange-400"
        >
          ← Back to Collection
        </a>
      </div>
    {/if}
  </div>
</div>

