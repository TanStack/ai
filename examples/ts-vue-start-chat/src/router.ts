import { createRouter } from '@tanstack/vue-router'
import { routeTree } from './routeTree.gen'

// Create a new router instance
export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  })
}
