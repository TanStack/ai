type TableSummaryProps = {
  totalCount: number
  resultCount: number
}

function TableSummary({ totalCount, resultCount }: TableSummaryProps) {
  const summary =
    resultCount === totalCount
      ? `Displaying ${resultCount} records`
      : `Displaying ${resultCount} of ${totalCount} records`

  return <p className="text-sm text-muted-foreground px-6">{summary}</p>
}

export default TableSummary
