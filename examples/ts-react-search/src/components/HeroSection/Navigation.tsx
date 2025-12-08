import { Link } from '@tanstack/react-router'

const NAVIGATION = [
  { name: 'Home', to: '/' },
  { name: 'Orders', to: '/orders' },
  { name: 'Disputes', to: '/disputes' },
  { name: 'Settlements', to: '/settlements' },
]

function Navigation() {
  return (
    <nav>
      <ul className="flex gap-4 uppercase justify-center">
        {NAVIGATION.map((item) => (
          <li
            className="before:content-[''] before:block before:size-2 before:bg-white/25 before:rounded-full before:mt-2.5 first:before:hidden flex gap-4"
            key={item.name}
          >
            <Link
              className="py-1 px-2 rounded hover:bg-white/10 text-sm transition-colors data-[status=active]:bg-white/10"
              to={item.to}
            >
              {item.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default Navigation
