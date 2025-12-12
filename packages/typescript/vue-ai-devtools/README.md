# @tanstack/vue-ai-devtools

Vue Devtools for TanStack AI.

## Usage

```ts
import { aiDevtoolsPlugin } from '@tanstack/vue-ai-devtools'
import { TanStackDevtools } from '@tanstack/vue-devtools'

const devtoolsPlugins = [aiDevtoolsPlugin()]

// in .vue file
   <TanStackDevtools
      :config="devtoolsConfig"
      :plugins="devtoolsPlugins"
      :eventBusConfig="devtoolsEventBusConfig"
    />

// in jsx
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

```

## 