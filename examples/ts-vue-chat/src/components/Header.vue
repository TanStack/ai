<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'

const isOpen = ref(false)
</script>

<template>
  <header class="p-4 flex items-center bg-gray-800 text-white shadow-lg">
    <button
      @click="isOpen = true"
      class="p-2 hover:bg-gray-700 rounded-lg transition-colors"
      aria-label="Open menu"
    >
      <svg
        class="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M4 6h16M4 12h16M4 18h16"
        />
      </svg>
    </button>
    <h1 class="ml-4 text-xl font-semibold">
      <RouterLink to="/">
        <img
          src="/tanstack-word-logo-white.svg"
          alt="TanStack Logo"
          class="h-10"
        />
      </RouterLink>
    </h1>
  </header>

  <!-- Sidebar -->
  <aside
    :class="[
      'fixed top-0 left-0 h-full w-80 bg-gray-900 text-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col',
      isOpen ? 'translate-x-0' : '-translate-x-full',
    ]"
  >
    <div class="flex items-center justify-between p-4 border-b border-gray-700">
      <h2 class="text-xl font-bold">Navigation</h2>
      <button
        @click="isOpen = false"
        class="p-2 hover:bg-gray-800 rounded-lg transition-colors"
        aria-label="Close menu"
      >
        <svg
          class="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>

    <nav class="flex-1 p-4 overflow-y-auto">
      <RouterLink
        to="/"
        @click="isOpen = false"
        class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
        active-class="bg-cyan-600 hover:bg-cyan-700"
      >
        <svg
          class="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
          />
        </svg>
        <span class="font-medium">Home</span>
      </RouterLink>

      <hr class="border-gray-700 my-2" />

      <RouterLink
        to="/vue-ui"
        @click="isOpen = false"
        class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
        active-class="bg-cyan-600 hover:bg-cyan-700"
      >
        <svg
          class="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
          />
        </svg>
        <span class="font-medium">Vue UI Demo</span>
      </RouterLink>

      <RouterLink
        to="/guitars"
        @click="isOpen = false"
        class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
        active-class="bg-cyan-600 hover:bg-cyan-700"
      >
        <svg
          class="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
          />
        </svg>
        <span class="font-medium">Guitar Demo</span>
      </RouterLink>
    </nav>
  </aside>

  <!-- Overlay -->
  <div
    v-if="isOpen"
    @click="isOpen = false"
    class="fixed inset-0 bg-black/50 z-40"
  />
</template>
