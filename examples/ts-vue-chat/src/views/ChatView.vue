<script setup lang="ts">
import { ref, computed } from 'vue'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-vue'
import { clientTools } from '@tanstack/ai-client'
import ChatInput from '@/components/ChatInput.vue'
import Messages from '@/components/Messages.vue'
import {
  MODEL_OPTIONS,
  getDefaultModelOption,
  setStoredModelPreference,
  type ModelOption,
} from '@/lib/model-selection'
import {
  getPersonalGuitarPreferenceToolDef,
  addToWishListToolDef,
  addToCartToolDef,
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

// Chat setup
const { messages, sendMessage, isLoading, addToolApprovalResponse, stop } =
  useChat({
    connection: fetchServerSentEvents('/api/chat'),
    tools,
    get body() {
      return {
        provider: selectedModel.value.provider,
        model: selectedModel.value.model,
      }
    },
  })

const handleSend = (message: string) => {
  sendMessage(message)
}

const handleApprove = (response: { id: string; approved: boolean }) => {
  addToolApprovalResponse(response)
}
</script>

<template>
  <div class="flex h-[calc(100vh-72px)] bg-gray-900">
    <div class="w-full flex flex-col">
      <!-- Model selector bar -->
      <div class="border-b border-orange-500/20 bg-gray-800 px-4 py-3">
        <div class="flex items-end gap-3">
          <div class="flex-1">
            <label for="model-select" class="text-sm text-gray-400 mb-2 block">
              Select Model:
            </label>
            <select
              id="model-select"
              :value="selectedIndex"
              @change="handleModelChange"
              :disabled="isLoading"
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
        </div>
      </div>

      <Messages :messages="messages" @approve="handleApprove" />

      <ChatInput :is-loading="isLoading" @send="handleSend" @stop="stop" />
    </div>
  </div>
</template>
