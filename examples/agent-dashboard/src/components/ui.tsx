/** Small shared primitives: the TanStack mark, avatars, and formatters. */

/** The official TanStack palm mark (tanstack.com/ds/logos), drawn in `currentColor`. */
export function TanStackMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="113 86 174 228"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M200 86C262.903 86 287 124.963 287 200C287 275.038 262.903 314 200 314C137.097 314 113 275.078 113 200C113 124.963 137.097 86 200 86ZM228.77 252.101C220.602 252.101 216.132 254.337 212.556 256.127C209.468 257.672 207.03 258.893 201.666 258.893C196.302 258.893 193.864 257.672 190.775 256.127C187.2 254.337 182.73 252.101 174.562 252.101C166.395 252.101 161.925 254.337 158.349 256.127C155.26 257.672 152.823 258.893 147.459 258.893V270.769C155.626 270.768 160.096 268.532 163.672 266.742C166.76 265.197 169.199 263.977 174.562 263.977C179.926 263.977 182.364 265.197 185.452 266.742C189.028 268.532 193.498 270.769 201.666 270.769C209.833 270.769 214.303 268.532 217.879 266.742C220.967 265.197 223.406 263.977 228.77 263.977C234.133 263.977 236.572 265.197 239.66 266.742C243.236 268.532 247.706 270.769 255.873 270.769V258.893C250.509 258.893 248.072 257.672 244.983 256.127C241.408 254.337 236.937 252.101 228.77 252.101ZM232.671 133.017C238.847 127.445 232.671 117.358 224.95 120.408C220.684 122.116 216.661 124.557 213.085 127.811C207.477 132.894 203.698 139.28 201.666 146.234C199.634 139.28 195.856 132.894 190.248 127.811C186.672 124.598 182.649 122.116 178.382 120.408C170.661 117.358 164.485 127.445 170.661 133.017L193.295 153.474C185.899 148.471 177.001 145.502 167.37 145.502C162.128 145.502 157.09 146.357 152.376 147.983C144.452 150.668 146.646 162.543 154.977 162.543H186.55C179.601 163.885 172.978 166.977 167.451 171.938C163.875 175.151 161.031 178.893 158.918 183.001C155.099 190.362 164.485 197.52 170.661 191.989L196.14 169.01L194.23 232.253C194.23 233.026 193.783 233.758 193.214 234.368C192.401 234.002 191.63 233.636 190.776 233.188C187.2 231.399 182.73 229.162 174.562 229.162C166.395 229.162 161.925 231.399 158.35 233.188C155.261 234.734 152.823 235.954 147.459 235.954V247.83C155.626 247.83 160.096 245.593 163.672 243.804C166.76 242.258 169.199 241.038 174.562 241.038C179.926 241.038 182.365 242.258 185.453 243.804C189.029 245.593 193.499 247.83 201.666 247.83C209.834 247.83 214.304 245.593 217.88 243.804C220.968 242.258 223.406 241.038 228.77 241.038C234.133 241.038 236.572 242.258 239.66 243.804C243.236 245.593 247.706 247.83 255.874 247.83V235.954C250.51 235.954 248.072 234.734 244.983 233.188V233.147C241.408 231.358 236.937 229.121 228.77 229.121C220.602 229.121 216.132 231.358 212.557 233.147C211.622 233.595 210.769 234.042 209.875 234.408C209.184 233.798 208.777 233.025 208.736 232.212L206.827 168.644L232.671 191.989C238.847 197.561 248.233 190.403 244.414 183.001C242.301 178.934 239.457 175.151 235.881 171.938C230.354 166.936 223.771 163.885 216.782 162.543H248.356C256.727 162.543 258.88 150.709 250.957 147.983C246.243 146.397 241.204 145.502 235.962 145.502C226.372 145.502 217.473 148.471 210.037 153.474L232.671 133.017Z" />
    </svg>
  )
}

/** Agents are rounded squares, humans are circles. No per-agent colours. */
export function Avatar({
  name,
  human,
  size = 28,
}: {
  name: string
  human?: boolean
  size?: number
}) {
  const initials = human
    ? name
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : (name.split('/').pop()?.[0] ?? '?').toUpperCase()
  return (
    <span
      style={{ width: size, height: size }}
      className={
        human
          ? 'inline-flex shrink-0 items-center justify-center rounded-full bg-ink-2 text-[11px] font-medium text-surface'
          : 'inline-flex shrink-0 items-center justify-center rounded-[7px] border border-line-strong bg-ui font-display text-xs font-bold text-ink'
      }
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}

/** A view's title row: display heading, subline, and right-aligned actions. */
export function PageHeader({
  title,
  sub,
  children,
}: {
  title: string
  sub?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="mb-7 flex items-start gap-4">
      <div>
        <h1 className="font-display text-[30px] leading-none font-bold">
          {title}
        </h1>
        {sub && <p className="mt-1.5 text-[13px] text-ink-2">{sub}</p>}
      </div>
      {children && (
        <div className="ml-auto flex items-center gap-2">{children}</div>
      )}
    </div>
  )
}

export const clock = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export const compact = (n: number) =>
  Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(n)
