export function StateInspector(props: { state: unknown }) {
  return (
    <div className="p-4 border rounded">
      <div className="font-semibold text-sm mb-2">State</div>
      <pre className="text-xs bg-gray-50 p-2 rounded whitespace-pre-wrap overflow-auto max-h-96">
        {JSON.stringify(props.state ?? {}, null, 2)}
      </pre>
    </div>
  )
}
