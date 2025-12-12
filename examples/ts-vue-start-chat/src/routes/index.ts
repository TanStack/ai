import { createFileRoute } from '@tanstack/vue-router'
import ChatView from '@/views/ChatView.vue'

export const Route = createFileRoute('/')({
  component: ChatView,
})
