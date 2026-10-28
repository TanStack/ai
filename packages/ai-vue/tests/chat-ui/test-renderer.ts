import { createSSRApp, type Component } from 'vue'
import { renderToString } from 'vue/server-renderer'

export async function renderVueText(component: Component) {
  return renderToString(createSSRApp(component))
}
