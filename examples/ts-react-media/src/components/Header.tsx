import { Link } from '@tanstack/react-router'

const navLinkClass =
  'px-3 py-1.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors'
const navLinkActiveClass = 'bg-gray-700 text-white'

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
      <nav className="ml-auto flex items-center gap-1">
        <Link
          to="/"
          className={navLinkClass}
          activeProps={{ className: `${navLinkClass} ${navLinkActiveClass}` }}
          activeOptions={{ exact: true }}
        >
          Generators
        </Link>
        <Link
          to="/seedance"
          className={navLinkClass}
          activeProps={{ className: `${navLinkClass} ${navLinkActiveClass}` }}
        >
          Seedance Studio
        </Link>
      </nav>
    </header>
  )
}
