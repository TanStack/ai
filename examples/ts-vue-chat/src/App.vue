<script setup lang="ts">
import Header from './components/Header.vue'

import { markRaw } from 'vue'
import { AiDevtoolsPanel } from '@tanstack/vue-ai-devtools'
import { TanStackDevtools } from '@tanstack/vue-devtools'

const devtoolsConfig = { position: 'bottom-right' as const }

const devtoolsPlugins = [
  {
    name: 'Tanstack AI',
    component: markRaw(AiDevtoolsPanel),
  },
]

const devtoolsEventBusConfig = { connectToServerBus: true }
</script>

<template>
  <div class="min-h-screen bg-gray-900">
    <Header />
    <router-view />

    <TanStackDevtools
      :config="devtoolsConfig"
      :plugins="devtoolsPlugins"
      :eventBusConfig="devtoolsEventBusConfig"
    />
  </div>
</template>