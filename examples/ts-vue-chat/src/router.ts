import { createRouter, createWebHistory } from 'vue-router'
import ChatView from './views/ChatView.vue'
import GuitarDetailView from './views/GuitarDetailView.vue'
import GuitarsView from './views/GuitarsView.vue'
import VueUIView from './views/VueUIView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'chat',
      component: ChatView,
    },
    {
      path: '/vue-ui',
      name: 'vue-ui',
      component: VueUIView,
    },
    {
      path: '/guitars',
      name: 'guitars',
      component: GuitarsView,
    },
    {
      path: '/guitars/:id',
      name: 'guitar-detail',
      component: GuitarDetailView,
    },
  ],
})

export default router
