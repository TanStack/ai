/** Stay well under `MAX_ARG_STRLEN` after base64 and quoting. */
export const /** Stay well under `MAX_ARG_STRLEN` after base64 and quoting. */
  FS_WRITE_BYTE_CHUNK = 32_768

function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function fsWriteCommands(
  abs: string,
  data: string | Uint8Array,
): Array<string> {
  const bytes =
    typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data)
  const dir = abs.replace(/\/[^/]*$/, '') || '/'
  const commands = [`mkdir -p ${quote(dir)} && : > ${quote(abs)}`]
  for (
    let offset = 0;
    offset < bytes.byteLength;
    offset += FS_WRITE_BYTE_CHUNK
  ) {
    const slice = bytes.subarray(offset, offset + FS_WRITE_BYTE_CHUNK)
    const b64 = Buffer.from(slice).toString('base64')
    commands.push(`printf %s ${quote(b64)} | base64 -d >> ${quote(abs)}`)
  }
  return commands
}
