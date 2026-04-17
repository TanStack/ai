import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_execute-prompt')({
  component: Outlet,
})
