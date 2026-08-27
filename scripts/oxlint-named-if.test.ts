import { describe, expect, it } from 'vitest'
import plugin, {
  hasTypeGuard,
  isExitStatement,
  isLogicalIfTest,
  isMechanicalName,
} from './oxlint-named-if.js'

function ident(name: string) {
  return { type: 'Identifier', name }
}

function literal(value: unknown) {
  return { type: 'Literal', value }
}

function logical(operator: '&&' | '||', left: object, right: object) {
  return { type: 'LogicalExpression', operator, left, right }
}

function unary(operator: string, argument: object) {
  return { type: 'UnaryExpression', operator, argument }
}

function binary(operator: string, left: object, right: object) {
  return { type: 'BinaryExpression', operator, left, right }
}

function member(object: object, property: object) {
  return { type: 'MemberExpression', object, property, computed: false }
}

function ret() {
  return { type: 'ReturnStatement', argument: null }
}

function exprStmt(expression: object) {
  return { type: 'ExpressionStatement', expression }
}

function block(body: Array<object>) {
  return { type: 'BlockStatement', body }
}

function call(callee: object, args: Array<object>) {
  return { type: 'CallExpression', callee, arguments: args }
}

function lintIf(test: object, consequent: object) {
  const reports: Array<{ messageId: string }> = []
  const visitor = plugin.rules['require-named-condition'].create({
    report(desc: { messageId: string }) {
      reports.push(desc)
    },
  })
  visitor.IfStatement({ test, consequent, alternate: null })
  return reports
}

describe('named-if require-named-condition', () => {
  it('flags a compound if whose body does not use a narrowed name', () => {
    const reports = lintIf(
      logical('&&', ident('ready'), ident('enabled')),
      block([exprStmt(call(ident('run'), []))]),
    )
    expect(reports).toMatchObject([{ messageId: 'nameIt' }])
  })

  it('allows a compound if that type-narrows a name used in the body', () => {
    const payload = ident('payload')
    const reports = lintIf(
      logical(
        '&&',
        binary('!==', payload, literal(null)),
        binary('===', unary('typeof', payload), literal('object')),
      ),
      block([exprStmt(call(ident('use'), [member(payload, ident('id'))]))]),
    )
    expect(reports).toEqual([])
  })

  it('allows a type-guard early return', () => {
    const value = ident('value')
    const reports = lintIf(
      logical(
        '||',
        binary('===', value, literal(null)),
        binary('!==', unary('typeof', value), literal('object')),
      ),
      ret(),
    )
    expect(reports).toEqual([])
  })

  it('does not flag a simple named if', () => {
    const reports = lintIf(
      ident('canResume'),
      block([exprStmt(call(ident('resume'), []))]),
    )
    expect(reports).toEqual([])
  })

  it('flags a script-concatenated condition const', () => {
    const reports: Array<{ messageId: string }> = []
    const visitor = plugin.rules['no-mechanical-name'].create({
      report(desc: { messageId: string }) {
        reports.push(desc)
      },
    })
    visitor.VariableDeclarator({
      id: ident('isTypeIsRUNFINISHEDOrTypeIsRUNERROR'),
      init: logical(
        '||',
        binary(
          '===',
          member(ident('chunk'), ident('type')),
          literal('RUN_FINISHED'),
        ),
        binary(
          '===',
          member(ident('chunk'), ident('type')),
          literal('RUN_ERROR'),
        ),
      ),
    })
    expect(reports).toMatchObject([{ messageId: 'rename' }])
  })
})

describe('named-if helpers', () => {
  it('detects a logical if test', () => {
    expect(isLogicalIfTest(logical('&&', ident('a'), ident('b')))).toBe(true)
    expect(isLogicalIfTest(ident('canResume'))).toBe(false)
  })

  it('detects typeof / null type guards', () => {
    expect(
      hasTypeGuard(
        binary('===', unary('typeof', ident('x')), literal('string')),
      ),
    ).toBe(true)
    expect(hasTypeGuard(binary('===', ident('x'), literal(null)))).toBe(true)
    expect(hasTypeGuard(ident('ready'))).toBe(false)
  })

  it('detects return / throw / continue / break as exits', () => {
    expect(isExitStatement(ret())).toBe(true)
    expect(isExitStatement(block([ret()]))).toBe(true)
    expect(isExitStatement(exprStmt(call(ident('run'), [])))).toBe(false)
  })

  it('rejects script-concatenated names and keeps intent names', () => {
    expect(isMechanicalName('isTypeIsRUNFINISHEDOrTypeIsRUNERROR')).toBe(true)
    expect(
      isMechanicalName('isNotMaxAttemptsIsIntegerOrMaxAttemptsCompared'),
    ).toBe(true)
    expect(
      isMechanicalName('isNotCompletedOrShouldAbortMessageQueueDrain2'),
    ).toBe(true)
    expect(isMechanicalName('isTerminalChunk')).toBe(false)
    expect(isMechanicalName('hasPendingInterrupts')).toBe(false)
    expect(isMechanicalName('isInvalidMaxAttempts')).toBe(false)
  })
})
