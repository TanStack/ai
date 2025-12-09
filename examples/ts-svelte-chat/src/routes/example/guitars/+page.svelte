<script lang="ts">
  import guitars from '$data/example-guitars'
</script>

<svelte:head>
  <title>Guitars - TanStack AI</title>
</svelte:head>

<div class="min-h-screen bg-gray-900 text-white p-8">
  <div class="max-w-7xl mx-auto">
    <h1 class="text-4xl font-bold mb-8">Our Guitar Collection</h1>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each guitars as guitar}
        <a
          href={`/example/guitars/${guitar.id}`}
          class="bg-gray-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-orange-500 transition-all"
        >
          <img
            src={guitar.image}
            alt={guitar.name}
            class="w-full h-64 object-cover"
          />
          <div class="p-6">
            <h2 class="text-2xl font-bold mb-2">{guitar.name}</h2>
            <p class="text-gray-400 mb-4">{guitar.shortDescription}</p>
            <div class="flex items-center justify-between">
              <span class="text-3xl font-bold text-orange-500"
                >${guitar.price}</span
              >
              <span class="text-orange-500 font-medium">View Details →</span>
            </div>
          </div>
        </a>
      {/each}
    </div>
  </div>
</div>
