<script lang="ts">
  import {
    createChat,
    fetchServerSentEvents,
    clientTools,
  } from '@tanstack/ai-svelte'
  import { createUI, UIChat } from '@tanstack/ai-svelte-ui'
  import {
    addToCartToolDef,
    addToWishListToolDef,
    getPersonalGuitarPreferenceToolDef,
    recommendGuitarToolDef,
  } from '$lib/guitar-tools'
  import Fallback from './Fallback.svelte'
  import Layout from './Layout.svelte'
  import Message from './Message.svelte'

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

  const ui = createUI(chatOptions)
  const chat = createChat(chatOptions)
  const components = ui.defineComponents({
    layout: Layout,
    message: Message,
    parts: { fallback: Fallback },
  })
</script>

<svelte:head>
  <title>TanStack AI - Svelte createUI</title>
</svelte:head>

<UIChat {ui} {chat} {components} />
