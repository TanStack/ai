<script lang="ts">
  import {
    createChat,
    fetchServerSentEvents,
    clientTools,
  } from '@tanstack/ai-svelte'
  import { createChatUI, UIChat } from '@tanstack/ai-svelte-ui'
  import {
    addToCartToolDef,
    addToWishListToolDef,
    getPersonalGuitarPreferenceToolDef,
    recommendGuitarToolDef,
  } from '$lib/guitar-tools'
  import Fallback from './Fallback.svelte'
  import Layout from './Layout.svelte'
  import Message from './Message.svelte'
  import Tool from './Tool.svelte'

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

  const chatOptions = {
    connection: fetchServerSentEvents('/api/chat'),
    tools,
  }

  const chat = createChat(chatOptions)
  const ui = createChatUI(chatOptions, {
    layout: Layout,
    message: Message,
    parts: { fallback: Fallback },
    tools: {
      recommendGuitar: Tool,
      getPersonalGuitarPreference: Tool,
      addToWishList: Tool,
      addToCart: Tool,
    },
  })
</script>

<svelte:head>
  <title>TanStack AI - Svelte createChatUI</title>
</svelte:head>

<UIChat {ui} {chat} />
