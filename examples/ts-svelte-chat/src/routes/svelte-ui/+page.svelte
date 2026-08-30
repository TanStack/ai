<script lang="ts">
  import { fetchServerSentEvents, clientTools, createChat } from '@tanstack/ai-svelte'
  import { Chat } from '@tanstack/ai-svelte/ui'
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

  const chatComponents = {
    layout: Layout,
    message: Message,
    parts: { fallback: Fallback },
    tools: {
      recommendGuitar: Tool,
      getPersonalGuitarPreference: Tool,
      addToWishList: Tool,
      addToCart: Tool,
    },
  }
  const chat = createChat(chatOptions)
</script>

<svelte:head>
  <title>TanStack AI - Svelte Chat UI</title>
</svelte:head>

<Chat {chat} components={chatComponents} />
