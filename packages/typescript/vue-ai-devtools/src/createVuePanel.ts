import { defineComponent, h, onMounted, onUnmounted, ref } from 'vue'
import type { DefineComponent } from 'vue'

export interface DevtoolsPanelProps {
  theme?: 'dark' | 'light'
}

type Theme = NonNullable<DevtoolsPanelProps['theme']>

// Copied from TanStack Devtools Vue helpers (devtools/packages/devtools-utils/src/vue/panel.ts),
// with async mount support.
export function createVuePanel<
  TComponentProps extends DevtoolsPanelProps,
  TCoreDevtoolsClass extends {
    mount: (
      el: HTMLElement,
      theme: Theme,
    ) => void | Promise<void>
    unmount: () => void
  },
>(CoreClass: new (props: TComponentProps) => TCoreDevtoolsClass) {
  const props = {
    theme: {
      type: String as () => DevtoolsPanelProps['theme'],
    },
    devtoolsProps: {
      type: Object as () => TComponentProps,
    },
  }

  const Panel = defineComponent({
    props,
    setup(config) {
      const devToolRef = ref<HTMLElement | null>(null)
      // Keep devtools instance non-reactive to avoid proxying,
      // since private fields (e.g. #isMounted) break on proxies.
      let devtools: TCoreDevtoolsClass | null = null
      let didMount = false
      let isUnmounted = false

      onMounted(async () => {
        const instance = new CoreClass(config.devtoolsProps as TComponentProps)
        devtools = instance

        if (devToolRef.value) {
          await instance.mount(devToolRef.value, config.theme ?? 'dark')
          if (isUnmounted) {
            // If we unmounted before mount finished, clean up.
            try {
              instance.unmount()
            } catch {
              // ignore
            }
          } else {
            didMount = true
          }
        }
      })

      onUnmounted(() => {
        isUnmounted = true
        if (didMount) {
          try {
            devtools?.unmount()
          } catch {
            // ignore
          }
        }
      })

      return () =>
        h('div', {
          style: { height: '100%' },
          ref: devToolRef,
        })
    },
  })

  const NoOpPanel = defineComponent({
    props,
    setup() {
      return () => null
    },
  })

  return [Panel, NoOpPanel] as unknown as [
    DefineComponent<{
      theme?: DevtoolsPanelProps['theme']
      devtoolsProps: TComponentProps
    }>,
    DefineComponent<{
      theme?: DevtoolsPanelProps['theme']
      devtoolsProps: TComponentProps
    }>,
  ]
}
