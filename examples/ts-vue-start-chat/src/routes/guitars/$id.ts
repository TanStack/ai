import { createFileRoute } from '@tanstack/vue-router'
import GuitarDetailView from '@/views/GuitarDetailView.vue'

export const Route = createFileRoute('/guitars/$id')({
  component: GuitarDetailView,
})
