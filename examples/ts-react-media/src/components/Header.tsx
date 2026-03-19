import { Link } from '@tanstack/react-router'

export default function Header() {
  return (
    <header className="p-4 flex items-center bg-gray-800 text-white shadow-lg">
      <h1 className="text-xl font-semibold">
        <Link to="/" className="flex items-center gap-3">
          <span className="text-2xl">🎨</span>
          <span>TanStack AI Visual</span>
        </Link>
      </h1>
      <span className="ml-4 text-sm text-gray-400">
        Image & Video Generation
      </span>
    </header>
  )
}
