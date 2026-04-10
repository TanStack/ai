export function NotSupported({
  provider,
  feature,
}: {
  provider: string
  feature: string
}) {
  return (
    <div data-testid="not-supported" className="p-6 text-center">
      <p className="text-gray-400">
        <span className="font-semibold text-orange-400">{provider}</span> does
        not support{' '}
        <span className="font-semibold text-orange-400">{feature}</span>
      </p>
    </div>
  )
}
