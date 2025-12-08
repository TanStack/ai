import { Link } from '@tanstack/react-router'
import { Route as homeRoute } from '@/routes'
import { Route as ordersRoute } from '@/routes/_layout/orders'
import { Route as disputesRoute } from '@/routes/_layout/disputes'
import { Route as settlementsRoute } from '@/routes/_layout/settlements'

const NAVIGATION = [
  { name: 'Home', to: homeRoute.to },
  { name: 'Orders', to: ordersRoute.to },
  { name: 'Disputes', to: disputesRoute.to },
  { name: 'Settlements', to: settlementsRoute.to },
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
