<script lang="ts">
  import { useChat, fetchServerSentEvents } from '@tanstack/ai-svelte'
  import { clientTools } from '@tanstack/ai-client'
  import Messages from '$lib/components/Messages.svelte'
  import ChatInput from '$lib/components/ChatInput.svelte'
  import {
    addToCartToolDef,
    addToWishListToolDef,
    getPersonalGuitarPreferenceToolDef,
    recommendGuitarToolDef,
  } from '$lib/guitar-tools'
  import {
    MODEL_OPTIONS,
    getDefaultModelOption,
    setStoredModelPreference,
    type ModelOption,
  } from '$lib/model-selection'
  import { onMount } from 'svelte'

  let selectedModel = $state<ModelOption>(MODEL_OPTIONS[0])
  let input = $state('')

  onMount(() => {
    selectedModel = getDefaultModelOption()
  })

  const getPersonalGuitarPreferenceToolClient =
    getPersonalGuitarPreferenceToolDef.client(() => ({
      preference: 'acoustic',
    }))

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

  // Note: body is captured at initialization time
  // To change models, the component would need to remount or we'd need a different pattern
  const {
    messages,
    isLoading,
    error,
    sendMessage,
    stop,
    addToolApprovalResponse,
  } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    tools,
    get body() {
      return {
        provider: selectedModel.provider,
        model: selectedModel.model,
      }
    },
  })

  function handleModelChange(e: Event) {
    const target = e.target as HTMLSelectElement
    const option = MODEL_OPTIONS[parseInt(target.value)]
    selectedModel = option
    setStoredModelPreference(option)
  }

  function handleSend(message: string) {
    sendMessage(message)
  }
</script>

<svelte:head>
  <title>TanStack AI - Svelte Chat</title>
</svelte:head>

<div class="flex h-[calc(100vh-72px)] bg-gray-900">
  <!-- Chat -->
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
            value={MODEL_OPTIONS.findIndex(
              (opt) =>
                opt.provider === selectedModel.provider &&
                opt.model === selectedModel.model,
            )}
            onchange={handleModelChange}
            disabled={$isLoading}
            class="w-full rounded-lg border border-orange-500/20 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50"
          >
            {#each MODEL_OPTIONS as option, index}
              <option value={index}>
                {option.label}
              </option>
            {/each}
          </select>
        </div>
      </div>
    </div>

    <Messages messages={$messages} {addToolApprovalResponse} />

    <ChatInput
      bind:value={input}
      isLoading={$isLoading}
      onSend={handleSend}
      onStop={stop}
    />
  </div>
</div>
