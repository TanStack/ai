import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const ts = createRequire(import.meta.url)('@typescript/typescript6')
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const mainRef = process.argv[2] ?? 'origin/main'

function gitShow(filePath) {
  try {
    return execFileSync('git', ['show', `${mainRef}:${filePath}`], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    })
  } catch {
    return null
  }
}

function scriptKind(fileName) {
  if (fileName.endsWith('.tsx')) return ts.ScriptKind.TSX
  return ts.ScriptKind.TS
}

function nodeName(node) {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isMethodSignature(node) ||
    ts.isPropertySignature(node) ||
    ts.isFunctionExpression(node) ||
    ts.isClassExpression(node)
  ) {
    return node.name ? node.name.getText() : null
  }
  if (ts.isConstructorDeclaration(node)) return 'constructor'
  if (ts.isVariableStatement(node)) {
    const first = node.declarationList.declarations[0]
    return first?.name ? first.name.getText() : null
  }
  if (ts.isVariableDeclaration(node)) {
    return node.name.getText()
  }
  return null
}

function leadingJsdocs(text, node) {
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []
  return ranges
    .map((range) => text.slice(range.pos, range.end).trim())
    .filter((comment) => comment.startsWith('/**'))
}

function collectJsdoc(text, fileName) {
  const sourceFile = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(fileName),
  )
  const byName = new Map()
  const visit = (node) => {
    const name = nodeName(node)
    const docs = leadingJsdocs(text, node)
    if (name && docs.length > 0 && !byName.has(name)) {
      byName.set(name, docs[docs.length - 1])
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return byName
}

function findNamedNodes(text, fileName) {
  const sourceFile = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(fileName),
  )
  const found = []
  const visit = (node) => {
    const name = nodeName(node)
    if (name) {
      found.push({ name, node, hasJsdoc: leadingJsdocs(text, node).length > 0 })
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

function restoreFile(relPath) {
  const abs = path.join(root, relPath)
  const ours = fs.readFileSync(abs, 'utf8')
  const main = gitShow(relPath.replaceAll('\\', '/'))
  if (main == null) return false
  const fromMain = collectJsdoc(main, path.basename(relPath))
  if (fromMain.size === 0) return false
  const named = findNamedNodes(ours, path.basename(relPath))
  const inserts = []
  const used = new Set()
  for (const item of named) {
    if (item.hasJsdoc || used.has(item.name)) continue
    const jsdoc = fromMain.get(item.name)
    if (!jsdoc) continue
    used.add(item.name)
    inserts.push({ pos: item.node.getStart(), jsdoc })
  }
  if (inserts.length === 0) return false
  inserts.sort((a, b) => b.pos - a.pos)
  let next = ours
  for (const insert of inserts) {
    const before = next.slice(0, insert.pos)
    const indentMatch = before.match(/(^|\n)([ \t]*)$/)
    const indent = indentMatch ? indentMatch[2] : ''
    const block = insert.jsdoc
      .split('\n')
      .map((line, i) => (i === 0 ? line : indent + line))
      .join('\n')
    next = `${before}${block}\n${indent}${next.slice(insert.pos)}`
  }
  if (next === ours) return false
  fs.writeFileSync(abs, next)
  return true
}

function walkSrc(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      walkSrc(full, acc)
    } else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !entry.name.endsWith('.tsrx.d.ts')
    ) {
      acc.push(full)
    }
  }
  return acc
}

const packagesDir = path.join(root, 'packages')
const files = fs
  .readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => {
    const src = path.join(packagesDir, entry.name, 'src')
    return fs.existsSync(src) ? walkSrc(src) : []
  })

let restored = 0
for (const abs of files) {
  const rel = path.relative(root, abs)
  if (restoreFile(rel)) restored++
}
console.log(
  `restored JSDoc in ${restored} of ${files.length} files from ${mainRef}`,
)
