export function parseSseDataLine(line: string): string {
  if (!line.startsWith('data:')) {
    return line
  }

  const data = line.slice(5)
  return data.startsWith(' ') ? data.slice(1) : data
}
