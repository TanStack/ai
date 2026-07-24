import { createFileRoute, redirect } from '@tanstack/react-router'

// The demo lives at /persistent-chat; send the root there.
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/persistent-chat' })
  },
})
