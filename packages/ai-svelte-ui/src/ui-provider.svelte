<script lang="ts">
  import { setUIContext, type ChatUIHost, type UIDescriptor } from './create-ui'

  let {
    ui,
    chat,
    components,
    children,
  }: {
    ui: UIDescriptor
    chat: ChatUIHost
    components: Record<string, unknown>
    children?: import('svelte').Snippet
  } = $props()

  setUIContext({
    ui,
    chat,
    components: components as never,
  })
</script>

{@render children?.()}
