/// <reference types="vite/client" />
import {
  Body,
  HeadContent,
  Html,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/vue-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/vue-router-devtools'
import { aiDevtoolsPlugin } from '@tanstack/vue-ai-devtools'

import { TanStackDevtools } from '@tanstack/vue-devtools'

import Header from '@/components/Header.vue'
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
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              id: 'tanstack-router',
              component: TanStackRouterDevtoolsPanel,
            },
            aiDevtoolsPlugin(),
          ]}
          eventBusConfig={{
            connectToServerBus: true,
          }}
        />

        <Scripts />
      </Body>
    </Html>
  )
}
