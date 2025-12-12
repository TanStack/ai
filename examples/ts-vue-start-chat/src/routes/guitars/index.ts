import { createFileRoute } from '@tanstack/vue-router'
import GuitarsView from '@/views/GuitarsView.vue'

export const Route = createFileRoute('/guitars/')({
  component: GuitarsView,
})

