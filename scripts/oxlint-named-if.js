function unwrap(node) {
  let current = node
  while (
    current &&
    current.type === 'ParenthesizedExpression' &&
    current.expression
  ) {
    current = current.expression
  }
  return current
}

function rootName(node) {
  const inner = unwrap(node)
  if (!inner) return null
  if (inner.type === 'Identifier') return inner.name
  if (
    inner.type === 'MemberExpression' ||
    inner.type === 'TSNonNullExpression'
  ) {
    return rootName(inner.object ?? inner.expression)
  }
  if (inner.type === 'ChainExpression') return rootName(inner.expression)
  return null
}

function isNullishLiteral(node) {
  const inner = unwrap(node)
  if (!inner) return false
  if (inner.type === 'Literal' && inner.value === null) return true
  if (inner.type === 'Identifier' && inner.name === 'undefined') return true
  if (inner.type === 'UnaryExpression' && inner.operator === 'void') return true
  return false
}

function isTypeofCheck(node) {
  const inner = unwrap(node)
  return inner?.type === 'UnaryExpression' && inner.operator === 'typeof'
}

function addName(names, node) {
  const name = rootName(node)
  if (name) names.add(name)
}

function collectNarrowedNames(node, names) {
  const inner = unwrap(node)
  if (!inner) return

  switch (inner.type) {
    case 'LogicalExpression':
      collectNarrowedNames(inner.left, names)
      collectNarrowedNames(inner.right, names)
      return
    case 'UnaryExpression':
      if (inner.operator === '!') {
        collectNarrowedNames(inner.argument, names)
        return
      }
      if (inner.operator === 'typeof') {
        addName(names, inner.argument)
      }
      return
    case 'BinaryExpression': {
      const op = inner.operator
      if (op === 'instanceof' || op === 'in') {
        addName(names, op === 'in' ? inner.right : inner.left)
        return
      }
      if (op === '==' || op === '!=' || op === '===' || op === '!==') {
        if (isTypeofCheck(inner.left)) addName(names, inner.left.argument)
        if (isTypeofCheck(inner.right)) addName(names, inner.right.argument)
        if (isNullishLiteral(inner.left)) addName(names, inner.right)
        if (isNullishLiteral(inner.right)) addName(names, inner.left)
      }
      return
    }
    case 'CallExpression': {
      for (const arg of inner.arguments ?? []) {
        if (arg.type !== 'SpreadElement') addName(names, arg)
      }
      return
    }
    case 'Identifier':
    case 'MemberExpression':
    case 'ChainExpression':
    case 'TSNonNullExpression':
      addName(names, inner)
      return
    default:
      return
  }
}

function collectUsedNames(node, names) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) collectUsedNames(child, names)
    return
  }
  if (node.type === 'Identifier' && typeof node.name === 'string') {
    names.add(node.name)
  }
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue
    collectUsedNames(node[key], names)
  }
}

function isLogicalIfTest(node) {
  const inner = unwrap(node)
  if (!inner) return false
  if (inner.type === 'LogicalExpression') return true
  if (inner.type === 'UnaryExpression' && inner.operator === '!') {
    return unwrap(inner.argument)?.type === 'LogicalExpression'
  }
  return false
}

function isExitStatement(node) {
  if (!node) return false
  if (
    node.type === 'ReturnStatement' ||
    node.type === 'ThrowStatement' ||
    node.type === 'ContinueStatement' ||
    node.type === 'BreakStatement'
  ) {
    return true
  }
  if (node.type === 'BlockStatement' && node.body.length === 1) {
    return isExitStatement(node.body[0])
  }
  return false
}

function hasTypeGuard(node) {
  const inner = unwrap(node)
  if (!inner) return false
  if (inner.type === 'LogicalExpression') {
    return hasTypeGuard(inner.left) || hasTypeGuard(inner.right)
  }
  if (inner.type === 'UnaryExpression') {
    if (inner.operator === 'typeof') return true
    if (inner.operator === '!') return hasTypeGuard(inner.argument)
    return false
  }
  if (inner.type === 'BinaryExpression') {
    const op = inner.operator
    if (op === 'instanceof' || op === 'in') return true
    if (op === '==' || op === '!=' || op === '===' || op === '!==') {
      return (
        isTypeofCheck(inner.left) ||
        isTypeofCheck(inner.right) ||
        isNullishLiteral(inner.left) ||
        isNullishLiteral(inner.right)
      )
    }
  }
  return false
}

const plugin = {
  meta: { name: 'named-if' },
  rules: {
    'require-named-condition': {
      meta: {
        type: 'suggestion',
        docs: {
          description:
            'Require a named boolean for compound if conditions that are not type-narrowing',
        },
        schema: [],
        messages: {
          nameIt:
            'Name this condition before the `if` (unless it type-narrows a value used in the block).',
        },
      },
      create(context) {
        return {
          IfStatement(node) {
            if (!isLogicalIfTest(node.test)) return

            if (hasTypeGuard(node.test) && isExitStatement(node.consequent)) {
              return
            }

            const narrowed = new Set()
            collectNarrowedNames(node.test, narrowed)
            if (narrowed.size === 0) {
              context.report({ node: node.test, messageId: 'nameIt' })
              return
            }

            const used = new Set()
            collectUsedNames(node.consequent, used)
            collectUsedNames(node.alternate, used)

            for (const name of narrowed) {
              if (used.has(name)) return
            }

            context.report({ node: node.test, messageId: 'nameIt' })
          },
        }
      },
    },
  },
}

export default plugin
