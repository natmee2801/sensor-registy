import { createRouter, createWebHistory } from 'vue-router'
import DevicesView from '@/views/DevicesView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'devices',
      component: DevicesView,
    },
    {
      path: '/register',
      name: 'register-device',
      component: () => import('@/views/RegisterDeviceView.vue'),
    },
    {
      path: '/devices/:id',
      name: 'device-detail',
      component: () => import('@/views/DeviceDetailView.vue'),
      props: true,
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: { name: 'devices' },
    },
  ],
})

export default router
