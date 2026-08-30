<script setup lang="ts">
import { computed, defineComponent, h, ref } from 'vue'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-vue'
import { clientTools } from '@tanstack/ai-client'
import { Chat } from '@tanstack/ai-vue/ui'

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

const connection = fetchServerSentEvents('/api/chat')

const chatOptions = {
  connection,
  tools,
  get body() {
    return {
      provider: selectedModel.value.provider,
      model: selectedModel.value.model,
    }
  },
}

const draft = ref('')

const chatComponents = {
    layout: defineComponent(
      (_, { slots }) =>
        () =>
          h('div', { class: 'flex-1 flex flex-col overflow-hidden' }, [
            slots.messages?.(),
            slots.input?.(),
          ]),
    ),
    message: defineComponent({
      props: ['message'],
      setup(props, { slots }) {
        return () =>
          h(
            'article',
            { 'data-role': props.message.role },
            slots.parts?.() ?? slots.default?.(),
          )
      },
    }),
    input: defineComponent({
      props: ['chat'],
      setup(props) {
        return () =>
          h('div', { class: 'border-t border-orange-500/20 bg-gray-800 p-4' }, [
            h(
              'form',
              {
                onSubmit: (event: Event) => {
                  event.preventDefault()
                  const text = draft.value.trim()
                  if (!text) return
                  draft.value = ''
                  void props.chat.sendMessage(text)
                },
              },
              [
                h('input', {
                  class:
                    'w-full rounded-lg border border-orange-500/20 bg-gray-900 px-3 py-2 text-white',
                  placeholder: 'Ask about guitars...',
                  value: draft.value,
                  onInput: (event: Event) => {
                    const target = event.target
                    if (target instanceof HTMLInputElement)
                      draft.value = target.value
                  },
                }),
              ],
            ),
          ])
      },
    }),
    parts: { fallback: defineComponent(() => () => null) },
    tools: {
      recommendGuitar: defineComponent({
        props: ['part'],
        setup(props) {
          return () => h('p', props.part.input?.id)
        },
      }),
      getPersonalGuitarPreference: defineComponent({
        props: ['part'],
        setup(props) {
          return () => h('p', props.part.output?.preference)
        },
      }),
      addToWishList: defineComponent({
        props: ['part', 'interrupt'],
        setup(props) {
          return () =>
            h('p', [
              props.part.input?.guitarId,
              props.interrupt?.status === 'pending'
                ? h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => props.interrupt?.resolveInterrupt(true),
                    },
                    'Approve',
                  )
                : null,
            ])
        },
      }),
      addToCart: defineComponent({
        props: ['part', 'interrupt'],
        setup(props) {
          return () =>
            h('p', [
              props.part.input?.guitarId,
              props.interrupt?.status === 'pending'
                ? h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => props.interrupt?.resolveInterrupt(true),
                    },
                    'Approve',
                  )
                : null,
            ])
        },
      }),
    },
}

const chat = useChat(chatOptions)
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
              @tanstack/ai-vue/ui
            </span>
          </div>
        </div>
      </div>

      <Chat :chat="chat" :components="chatComponents" />
    </div>
  </div>
</template>
