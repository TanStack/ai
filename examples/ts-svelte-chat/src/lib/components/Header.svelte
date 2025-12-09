<script lang="ts">
  import { Menu, X, Home, Guitar } from 'lucide-svelte'

  let isOpen = $state(false)
</script>

<header class="p-4 flex items-center bg-gray-800 text-white shadow-lg">
  <button
    onclick={() => (isOpen = true)}
    class="p-2 hover:bg-gray-700 rounded-lg transition-colors"
    aria-label="Open menu"
  >
    <Menu size={24} />
  </button>
  <h1 class="ml-4 text-xl font-semibold">
    <a href="/">
      <img
        src="/tanstack-word-logo-white.svg"
        alt="TanStack Logo"
        class="h-10"
      />
    </a>
  </h1>
</header>

<aside
  class={`fixed top-0 left-0 h-full w-80 bg-gray-900 text-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
    isOpen ? 'translate-x-0' : '-translate-x-full'
  }`}
>
  <div class="flex items-center justify-between p-4 border-b border-gray-700">
    <h2 class="text-xl font-bold">Navigation</h2>
    <button
      onclick={() => (isOpen = false)}
      class="p-2 hover:bg-gray-800 rounded-lg transition-colors"
      aria-label="Close menu"
    >
      <X size={24} />
    </button>
  </div>

  <nav class="flex-1 p-4 overflow-y-auto">
    <a
      href="/"
      onclick={() => (isOpen = false)}
      class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
    >
      <Home size={20} />
      <span class="font-medium">Home</span>
    </a>

    <hr class="my-2 border-gray-700" />

    <a
      href="/example/guitars"
      onclick={() => (isOpen = false)}
      class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
    >
      <Guitar size={20} />
      <span class="font-medium">Guitar Demo</span>
    </a>
  </nav>
</aside>
