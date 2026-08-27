import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const ts = createRequire(import.meta.url)('@typescript/typescript6')

const DIRECTIVE =
  /^(?:oxlint-|eslint-|ts-|@ts-|spdx-license-identifier|copyright\b|licensed under)/i

function isDirectiveText(text) {
  return DIRECTIVE.test(text.replace(/^[/*\s]+/, '').trim())
}

function collectCommentRanges(text, fileName) {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    kind,
  )
  const seen = new Set()
  const ranges = []
  const visit = (node) => {
    for (const range of ts.getLeadingCommentRanges(text, node.getFullStart()) ??
      []) {
      const key = `${range.pos}:${range.end}`
      if (!seen.has(key)) {
        seen.add(key)
        ranges.push(range)
      }
    }
    for (const range of ts.getTrailingCommentRanges(text, node.end) ?? []) {
      const key = `${range.pos}:${range.end}`
      if (!seen.has(key)) {
        seen.add(key)
        ranges.push(range)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return ranges
}

function posToLine(text, pos) {
  return text.slice(0, pos).split('\n').length
}

function stripFile(filePath) {
  const original = fs.readFileSync(filePath, 'utf8')
  const lines = original.split('\n')
  const keep = Array.from({ length: lines.length }, () => true)

  const ranges = collectCommentRanges(original, path.basename(filePath))
  const lineComments = []

  for (const range of ranges) {
    const commentText = original.slice(range.pos, range.end)
    if (isDirectiveText(commentText)) continue
    const startLine = posToLine(original, range.pos)
    const endLine = posToLine(original, range.end)
    const lineCount = endLine - startLine + 1
    if (range.kind === ts.SyntaxKind.MultiLineCommentTrivia) {
      if (lineCount > 2) {
        for (let i = startLine - 1; i < endLine; i++) keep[i] = false
      }
      continue
    }
    if (range.kind === ts.SyntaxKind.SingleLineCommentTrivia) {
      lineComments.push({ startLine, endLine, text: commentText })
    }
  }

  lineComments.sort((a, b) => a.startLine - b.startLine)
  let runStart = -1
  let runEnd = -1
  const flush = () => {
    if (runStart >= 0 && runEnd - runStart + 1 > 2) {
      for (let i = runStart - 1; i < runEnd; i++) keep[i] = false
    }
    runStart = -1
    runEnd = -1
  }
  for (const comment of lineComments) {
    if (runStart < 0) {
      runStart = comment.startLine
      runEnd = comment.endLine
      continue
    }
    if (comment.startLine === runEnd + 1) {
      runEnd = comment.endLine
      continue
    }
    flush()
    runStart = comment.startLine
    runEnd = comment.endLine
  }
  flush()

  const next = lines.filter((_, i) => keep[i]).join('\n')
  if (next !== original) {
    fs.writeFileSync(filePath, next)
    return true
  }
  return false
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      walk(full, acc)
    } else if (
      /\.(js|ts|tsx)$/.test(entry.name) &&
      !entry.name.endsWith('.tsrx.d.ts')
    ) {
      acc.push(full)
    }
  }
  return acc
}

const packagesDir = path.join(
  path.dirname(path.dirname(fileURLToPath(import.meta.url))),
  'packages',
)
const files = fs
  .readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => {
    const src = path.join(packagesDir, entry.name, 'src')
    return fs.existsSync(src) ? walk(src) : []
  })

let changed = 0
for (const file of files) {
  if (stripFile(file)) changed++
}
console.log(`stripped long comments in ${changed} of ${files.length} files`)
