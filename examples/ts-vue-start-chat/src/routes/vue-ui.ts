import { createFileRoute } from '@tanstack/vue-router'
import VueUIView from '@/views/VueUIView.vue'

export const Route = createFileRoute('/vue-ui')({
  component: VueUIView,
})
