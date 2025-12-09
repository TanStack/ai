<script lang="ts">
  import guitars from '$data/example-guitars'

  interface Props {
    id: number
  }

  let { id }: Props = $props()

  const guitar = $derived(guitars.find((g) => g.id === id))
</script>

{#if guitar}
  <div
    class="mt-2 bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden"
  >
    <img
      src={guitar.image}
      alt={guitar.name}
      class="w-full h-48 object-cover"
    />
    <div class="p-4">
      <h3 class="text-xl font-bold text-white mb-2">{guitar.name}</h3>
      <p class="text-gray-300 text-sm mb-3">{guitar.shortDescription}</p>
      <div class="flex items-center justify-between">
        <span class="text-2xl font-bold text-orange-500">${guitar.price}</span>
        <a
          href={`/example/guitars/${guitar.id}`}
          class="px-4 py-2 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white rounded-lg font-medium transition-colors"
        >
          View Details
        </a>
      </div>
    </div>
  </div>
{:else}
  <div class="mt-2 bg-red-500/10 border border-red-500/20 rounded-lg p-4">
    <p class="text-red-400">Guitar with ID {id} not found</p>
  </div>
{/if}
