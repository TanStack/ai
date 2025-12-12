/// <reference types="vite/client" />
import {
  Body,
  HeadContent,
  Html,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/vue-router'
import { TanStackRouterDevtoolsPanelInProd } from '@tanstack/vue-router-devtools'
import { AiDevtoolsPanelInProd } from '@tanstack/vue-ai-devtools'

import { TanStackDevtools } from '@tanstack/vue-devtools'

import Header from '@/components/Header.vue'
import ClientOnly from '@/components/ClientOnly.vue'
import appCss from '@/styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'TanStack AI Vue Start Chat',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <Html>
      <head>
        <HeadContent />
      </head>
      <Body class="min-h-screen bg-gray-900">
        <Header />
        <Outlet />
				<ClientOnly>
					<TanStackDevtools
						config={{
							position: 'bottom-right',
						}}
						plugins={[
							{
								name: 'TanStack Router',
								id: 'tanstack-router',
								component: TanStackRouterDevtoolsPanelInProd,
							},
							{
								name: 'TanStack AI',
								id: 'tanstack-ai',
								component: AiDevtoolsPanelInProd,
							},
						]}
						eventBusConfig={{
							connectToServerBus: true,
						}}
					/>
				</ClientOnly>
        <Scripts />
      </Body>
    </Html>
  )
}
