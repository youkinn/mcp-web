import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import ChatView from '../views/ChatView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/chat',
      name: 'chat',
      component: ChatView,
    },
    {
      path: '/logs',
      name: 'logs',
      component: () => import('../views/LogsView.vue'),
    },
    {
      path: '/cache',
      name: 'cache',
      component: () => import('../views/CacheView.vue'),
    },
  ],
})

export default router
