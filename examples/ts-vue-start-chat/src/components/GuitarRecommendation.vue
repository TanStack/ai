<script setup lang="ts">
import { computed } from 'vue'
import { useNavigate } from '@tanstack/vue-router'
import { guitars } from '@/data/guitars'

const props = defineProps<{
  id: string | number
}>()

const navigate = useNavigate()

const guitar = computed(() => guitars.find((g) => g.id === +props.id))

const handleViewDetails = () => {
  if (guitar.value) {
    navigate({
      to: '/guitars/$id',
      params: { id: guitar.value.id.toString() },
    })
  }
}
</script>

<template>
  <div
    v-if="guitar"
    class="my-4 rounded-lg overflow-hidden border border-orange-500/20 bg-gray-800/50"
  >
    <div class="aspect-[4/3] relative overflow-hidden">
      <img
        :src="guitar.image"
        :alt="guitar.name"
        class="w-full h-full object-cover"
      />
    </div>
    <div class="p-4">
      <h3 class="text-lg font-semibold text-white mb-2">{{ guitar.name }}</h3>
      <p class="text-sm text-gray-300 mb-3 line-clamp-2">
        {{ guitar.shortDescription }}
      </p>
      <div class="flex items-center justify-between">
        <div class="text-lg font-bold text-emerald-400">
          ${{ guitar.price }}
        </div>
        <button
          @click="handleViewDetails"
          class="bg-gradient-to-r from-orange-500 to-red-600 text-white px-4 py-1.5 rounded-lg text-sm hover:opacity-90 transition-opacity"
        >
          View Details
        </button>
      </div>
    </div>
  </div>
</template>
