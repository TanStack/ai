<script setup lang="ts">
import { computed } from 'vue'
import { useParams, useRouter } from '@tanstack/vue-router'
import { guitars } from '@/data/guitars'

const params = useParams({ from: '/guitars/$id' })
const router = useRouter()

const guitar = computed(() => {
  const id = parseInt(params.value.id as string)
  return guitars.find((g) => g.id === id)
})

const handleBack = () => {
  router.history.back()
}
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <button
      @click="handleBack"
      class="mb-6 flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
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
          d="M15 19l-7-7 7-7"
        />
      </svg>
      Back
    </button>

    <div v-if="guitar" class="max-w-4xl mx-auto">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div class="rounded-lg overflow-hidden border border-orange-500/20">
          <img :src="guitar.image" :alt="guitar.name" class="w-full h-auto" />
        </div>

        <div>
          <h1 class="text-3xl font-bold text-white mb-4">{{ guitar.name }}</h1>
          <div class="text-3xl font-bold text-emerald-400 mb-6">
            ${{ guitar.price }}
          </div>
          <p class="text-gray-300 leading-relaxed mb-6">
            {{ guitar.description }}
          </p>
          <button
            class="w-full bg-gradient-to-r from-orange-500 to-red-600 text-white px-6 py-3 rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>

    <div v-else class="text-center py-12">
      <p class="text-gray-400 text-lg">Guitar not found</p>
    </div>
  </div>
</template>
