import { useMemo, useState } from 'react'
import { CodeBlock } from './CodeBlock'
import { extractFileFromPatch } from '@/lib/diff-extract'

export interface FileEntry {
  filename: string
  patch: string
  /** Mark a file as still being written so the tree highlights it. */
  streaming?: boolean
}

interface DirNode {
  kind: 'dir'
  name: string
  path: string
  children: Array<TreeNode>
}
interface FileNode {
  kind: 'file'
  name: string
  path: string
  entry: FileEntry
}
type TreeNode = DirNode | FileNode

/**
 * Right-side panel listing every file the coder has touched in this run as a
 * collapsible folder tree. Click a file to expand its diff inline, rendered
 * through shiki. Streaming files (the one the coder is currently writing)
 * stay flagged with a citron dot.
 */
export function FileTreePanel(props: { files: Array<FileEntry> }) {
  const root = useMemo(() => buildTree(props.files), [props.files])

  return (
    <aside className="bg-ink border border-ink-line h-[72vh] flex flex-col font-mono text-[13px]">
      <header className="px-4 py-2 border-b border-ink-line flex items-baseline gap-3 shrink-0">
        <span className="text-bone">files</span>
        <span className="text-taupe tabular text-[11px]">
          {props.files.length}{' '}
          {props.files.length === 1 ? 'patch' : 'patches'}
        </span>
        {props.files.some((f) => f.streaming) && (
          <span className="ml-auto text-citron anim-citron-pulse text-[11px]">
            ◉ writing
          </span>
        )}
      </header>
      <div className="flex-1 overflow-y-auto px-3 py-3 text-bone">
        {props.files.length === 0 ? (
          <EmptyState />
        ) : (
          <TreeLevel nodes={root.children} depth={0} />
        )}
      </div>
    </aside>
  )
}

function EmptyState() {
  return (
    <div className="text-taupe-deep italic text-center py-12">
      no files yet.
      <br />
      <span className="text-[11px] not-italic">
        coder output will appear here.
      </span>
    </div>
  )
}

function TreeLevel(props: { nodes: Array<TreeNode>; depth: number }) {
  return (
    <ul className="space-y-0.5">
      {props.nodes.map((node) => (
        <li key={node.path}>
          {node.kind === 'dir' ? (
            <DirRow node={node} depth={props.depth} />
          ) : (
            <FileRow node={node} depth={props.depth} />
          )}
        </li>
      ))}
    </ul>
  )
}

function DirRow(props: { node: DirNode; depth: number }) {
  // Folders default open — most demo runs touch only a handful of files, so
  // expanding everything is more useful than gating it behind a click.
  const [open, setOpen] = useState(true)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 w-full text-left hover:text-citron transition-colors"
        style={{ paddingLeft: props.depth * 12 }}
      >
        <span className="text-citron w-3 text-center select-none">
          {open ? '▾' : '▸'}
        </span>
        <span className="text-taupe">{props.node.name}/</span>
      </button>
      {open && <TreeLevel nodes={props.node.children} depth={props.depth + 1} />}
    </div>
  )
}

function FileRow(props: { node: FileNode; depth: number }) {
  const [open, setOpen] = useState(false)
  const { entry } = props.node
  // Re-extract on every patch update so the live view fills in as the
  // streaming diff grows. extractFileFromPatch is pure + cheap (linear scan).
  const fileBody = useMemo(
    () => extractFileFromPatch(entry.patch),
    [entry.patch],
  )
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 w-full text-left hover:text-citron transition-colors group"
        style={{ paddingLeft: props.depth * 12 }}
      >
        <span className="text-citron w-3 text-center select-none">
          {open ? '▾' : '▸'}
        </span>
        <span
          className={
            entry.streaming
              ? 'text-citron'
              : 'text-bone group-hover:text-citron transition-colors'
          }
        >
          {props.node.name}
        </span>
        {entry.streaming && (
          <span className="ml-1 w-1.5 h-1.5 rounded-full bg-citron anim-citron-pulse" />
        )}
      </button>
      {open && (
        <div className="mt-1 mb-2" style={{ paddingLeft: props.depth * 12 + 16 }}>
          <CodeBlock
            code={fileBody}
            filename={entry.filename}
            maxHeight="20rem"
            streaming={entry.streaming}
          />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Tree construction
// ============================================================================

function buildTree(files: Array<FileEntry>): DirNode {
  const root: DirNode = { kind: 'dir', name: '', path: '', children: [] }
  for (const entry of files) {
    const parts = entry.filename.split('/').filter(Boolean)
    if (parts.length === 0) continue
    insertEntry(root, parts, entry, '')
  }
  sortTree(root)
  collapseSingleChildDirs(root)
  return root
}

function insertEntry(
  parent: DirNode,
  segments: Array<string>,
  entry: FileEntry,
  prefix: string,
): void {
  const [head, ...rest] = segments
  if (!head) return
  const path = prefix ? `${prefix}/${head}` : head
  if (rest.length === 0) {
    parent.children.push({ kind: 'file', name: head, path, entry })
    return
  }
  let dir = parent.children.find(
    (c): c is DirNode => c.kind === 'dir' && c.name === head,
  )
  if (!dir) {
    dir = { kind: 'dir', name: head, path, children: [] }
    parent.children.push(dir)
  }
  insertEntry(dir, rest, entry, path)
}

function sortTree(node: DirNode): void {
  node.children.sort((a, b) => {
    // Directories first, then files; alphabetical within each group.
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  for (const child of node.children) {
    if (child.kind === 'dir') sortTree(child)
  }
}

/**
 * Collapse chains like `src › lib › workflows › foo.ts` where every directory
 * has exactly one child directory — render them as `src/lib/workflows/` on a
 * single row so the panel doesn't waste vertical space on stub folders.
 */
function collapseSingleChildDirs(node: DirNode): void {
  for (const child of node.children) {
    if (child.kind !== 'dir') continue
    while (child.children.length === 1 && child.children[0].kind === 'dir') {
      const only = child.children[0]
      child.name = `${child.name}/${only.name}`
      child.path = only.path
      child.children = only.children
    }
    collapseSingleChildDirs(child)
  }
}
