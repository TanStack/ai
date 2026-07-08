function getBaseUrl() {
  if (typeof window !== 'undefined') return ''

  return import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
}

export default getBaseUrl
