import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_banking-demo')({
  component: Outlet,
})
