<script setup lang="ts">
import { computed, ref } from 'vue'
import { fetchServerSentEvents } from '@tanstack/ai-vue'
import { clientTools } from '@tanstack/ai-client'
import { Chat, ChatMessages, ChatInput } from '@tanstack/ai-vue-ui'

import type { ModelOption } from '@/lib/model-selection'

import {
  MODEL_OPTIONS,
  getDefaultModelOption,
  setStoredModelPreference,
} from '@/lib/model-selection'
import {
  addToCartToolDef,
  addToWishListToolDef,
  getPersonalGuitarPreferenceToolDef,
  recommendGuitarToolDef,
} from '@/lib/guitar-tools'

// Client-side tool implementations
const getPersonalGuitarPreferenceToolClient =
  getPersonalGuitarPreferenceToolDef.client(() => ({ preference: 'acoustic' }))

const addToWishListToolClient = addToWishListToolDef.client((args) => {
  const wishList = JSON.parse(localStorage.getItem('wishList') || '[]')
  wishList.push(args.guitarId)
  localStorage.setItem('wishList', JSON.stringify(wishList))
  return {
    success: true,
    guitarId: args.guitarId,
    totalItems: wishList.length,
  }
})

const addToCartToolClient = addToCartToolDef.client((args) => ({
  success: true,
  cartId: 'CART_CLIENT_' + Date.now(),
  guitarId: args.guitarId,
  quantity: args.quantity,
  totalItems: args.quantity,
}))

const recommendGuitarToolClient = recommendGuitarToolDef.client(({ id }) => ({
  id: +id,
}))

const tools = clientTools(
  getPersonalGuitarPreferenceToolClient,
  addToWishListToolClient,
  addToCartToolClient,
  recommendGuitarToolClient,
)

// Model selection
const selectedModel = ref<ModelOption>(getDefaultModelOption())

const selectedIndex = computed(() =>
  MODEL_OPTIONS.findIndex(
    (opt) =>
      opt.provider === selectedModel.value.provider &&
      opt.model === selectedModel.value.model,
  ),
)

const handleModelChange = (e: Event) => {
  const target = e.target as HTMLSelectElement
  const option = MODEL_OPTIONS[parseInt(target.value)]
  selectedModel.value = option
  setStoredModelPreference(option)
}

// Connection with dynamic body
const connection = fetchServerSentEvents('/api/chat')
</script>

<template>
  <div class="flex h-[calc(100vh-72px)] bg-gray-900">
    <div class="w-full flex flex-col">
      <!-- Model selector bar -->
      <div class="border-b border-orange-500/20 bg-gray-800 px-4 py-3">
        <div class="flex items-center gap-3">
          <div class="flex-1">
            <label for="model-select" class="text-sm text-gray-400 mb-2 block">
              Select Model:
            </label>
            <select
              id="model-select"
              :value="selectedIndex"
              @change="handleModelChange"
              class="w-full rounded-lg border border-orange-500/20 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50"
            >
              <option
                v-for="(option, index) in MODEL_OPTIONS"
                :key="index"
                :value="index"
              >
                {{ option.label }}
              </option>
            </select>
          </div>
          <div class="pt-6">
            <span
              class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
            >
              @tanstack/ai-vue-ui
            </span>
          </div>
        </div>
      </div>

      <!-- Chat component from ai-vue-ui -->
      <Chat
        :connection="connection"
        :tools="tools"
        :body="{
          provider: selectedModel.provider,
          model: selectedModel.model,
        }"
        class="flex-1 flex flex-col overflow-hidden"
      >
        <ChatMessages
          class="flex-1 overflow-y-auto p-4 space-y-4"
          :auto-scroll="true"
        >
          <template #emptyState>
            <div
              class="flex-1 flex items-center justify-center text-gray-400 h-full"
            >
              <div class="text-center">
                <p class="text-lg mb-2">Welcome to the Vue UI Demo!</p>
                <p class="text-sm">
                  This view uses
                  <code class="text-cyan-400">@tanstack/ai-vue-ui</code>
                  components.
                </p>
                <p class="text-sm mt-1">Send a message to get started.</p>
              </div>
            </div>
          </template>
        </ChatMessages>

        <div class="border-t border-orange-500/20 bg-gray-800 p-4">
          <ChatInput placeholder="Ask about guitars..." />
        </div>
      </Chat>
    </div>
  </div>
</template>
