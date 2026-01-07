<script setup lang="ts">
import { Link } from '@tanstack/vue-router'
import { guitars } from '@/data/guitars'
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold text-white mb-8">Our Guitars</h1>

    <div
      class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
    >
      <Link
        v-for="guitar in guitars"
        :key="guitar.id"
        :to="`/guitars/${guitar.id}`"
        class="block rounded-lg overflow-hidden border border-orange-500/20 bg-gray-800/50 hover:border-orange-500/40 transition-colors"
      >
        <div class="aspect-[4/3] relative overflow-hidden">
          <img
            :src="guitar.image"
            :alt="guitar.name"
            class="w-full h-full object-cover"
          />
        </div>
        <div class="p-4">
          <h3 class="text-lg font-semibold text-white mb-2">
            {{ guitar.name }}
          </h3>
          <p class="text-sm text-gray-300 mb-3 line-clamp-2">
            {{ guitar.shortDescription }}
          </p>
          <div class="text-lg font-bold text-emerald-400">
            ${{ guitar.price }}
          </div>
        </div>
      </Link>
    </div>
  </div>
</template>
