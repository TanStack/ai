import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

function useSearchMutation() {
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async (content: string) => {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })

      if (!response.ok) {
        throw new Error('Search request failed')
      }

      return response.json()
    },
    onSuccess: async (json) => {
      const { name, parameters } = json?.data ?? {}

      if (name && parameters) {
        await navigate({ to: `/${name}`, search: parameters })
      }
    },
  })
}

export default useSearchMutation
