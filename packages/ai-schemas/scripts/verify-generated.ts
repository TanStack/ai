#!/usr/bin/env tsx
/**
 * Verify that every module under src/providers/ is data-only TypeScript.
 *
 * The nightly sync feeds third-party-controlled OpenAPI specs (notably
 * per-model FAL metadata, which any FAL model author can edit) through
 * @hey-api/openapi-ts into modules that execute on import and ship to npm.
 * If the codegen ever mis-escapes spec content, that's a code-injection
 * pivot. This check closes the class: generated modules may contain only
 * literals, references to locally declared schemas, and zod builder chains.
 *
 * Allowed per file:
 *   - `import * as z from 'zod'` / named imports from same-directory .js
 *   - `export * from './x.js'` re-exports (same directory only)
 *   - exported `const` declarations whose initializers are literals,
 *     object/array literals, zod call chains, or `z.lazy(() => zX)` arrows
 *   - type aliases / interfaces (erased at runtime)
 *
 * Everything else — template substitutions, element access, `new`, spreads,
 * arbitrary functions, accesses to constructor/prototype/etc. — fails.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

// Same-directory relative specifier with a .js extension. The character
// class excludes '/', so '../' traversal and deep paths can't match.
const SAME_DIR_MODULE = /^\.\/[A-Za-z0-9._-]+\.js$/

// Property accesses that pivot from data to executable code
// (e.g. `z.constructor('...')()` is the Function constructor).
const FORBIDDEN_PROPERTY_NAMES = new Set([
  'constructor',
  'prototype',
  '__proto__',
  'call',
  'apply',
  'bind',
])

export interface VerifyResult {
  fileCount: number
  violations: Array<string>
}

export function verifyGeneratedSource(
  fileName: string,
  sourceText: string,
): Array<string> {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  )
  const violations: Array<string> = []

  const report = (node: ts.Node, message: string): void => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    )
    violations.push(`${fileName}:${line + 1} ${message}`)
  }

  // Pass 1: collect every name the file legitimately brings into scope.
  // Expression identifiers must resolve to one of these.
  const declared = new Set<string>()
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && statement.importClause) {
      const { name, namedBindings } = statement.importClause
      if (name) declared.add(name.text)
      if (namedBindings) {
        if (ts.isNamespaceImport(namedBindings)) {
          declared.add(namedBindings.name.text)
        } else {
          for (const element of namedBindings.elements) {
            declared.add(element.name.text)
          }
        }
      }
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          declared.add(declaration.name.text)
        }
      }
    }
  }

  const kindName = (node: ts.Node): string => ts.SyntaxKind[node.kind]

  const checkExpression = (node: ts.Expression): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isNumericLiteral(node) ||
      ts.isBigIntLiteral(node) ||
      ts.isRegularExpressionLiteral(node) ||
      node.kind === ts.SyntaxKind.TrueKeyword ||
      node.kind === ts.SyntaxKind.FalseKeyword ||
      node.kind === ts.SyntaxKind.NullKeyword
    ) {
      return
    }
    if (
      ts.isPrefixUnaryExpression(node) &&
      node.operator === ts.SyntaxKind.MinusToken &&
      ts.isNumericLiteral(node.operand)
    ) {
      return
    }
    if (ts.isIdentifier(node)) {
      if (node.text !== 'undefined' && !declared.has(node.text)) {
        report(node, `reference to undeclared identifier '${node.text}'`)
      }
      return
    }
    if (ts.isPropertyAccessExpression(node)) {
      if (FORBIDDEN_PROPERTY_NAMES.has(node.name.text)) {
        report(node, `forbidden property access '.${node.name.text}'`)
      }
      checkExpression(node.expression)
      return
    }
    if (ts.isCallExpression(node)) {
      // Codegen wraps int64 bounds in BigInt(...); allow that one global,
      // and only as a direct call (a bare `BigInt` reference still fails).
      const isBigIntCall =
        ts.isIdentifier(node.expression) && node.expression.text === 'BigInt'
      if (!isBigIntCall) {
        checkExpression(node.expression)
      }
      for (const argument of node.arguments) {
        checkExpression(argument)
      }
      return
    }
    if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (ts.isPropertyAssignment(property)) {
          if (
            !ts.isIdentifier(property.name) &&
            !ts.isStringLiteral(property.name) &&
            !ts.isNumericLiteral(property.name)
          ) {
            report(
              property,
              `disallowed property name (${kindName(property.name)})`,
            )
          }
          checkExpression(property.initializer)
        } else if (ts.isShorthandPropertyAssignment(property)) {
          if (!declared.has(property.name.text)) {
            report(
              property,
              `shorthand reference to undeclared identifier '${property.name.text}'`,
            )
          }
        } else {
          report(property, `disallowed object member (${kindName(property)})`)
        }
      }
      return
    }
    if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) {
        checkExpression(element)
      }
      return
    }
    if (ts.isArrowFunction(node)) {
      // Only the recursive-schema shape codegen emits: `(): any => zX`.
      if (node.parameters.length !== 0) {
        report(node, 'arrow functions with parameters are not allowed')
      } else if (!ts.isIdentifier(node.body)) {
        report(node, 'arrow function body must be a bare identifier')
      } else if (!declared.has(node.body.text)) {
        report(
          node,
          `arrow body references undeclared identifier '${node.body.text}'`,
        )
      }
      return
    }
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node)
    ) {
      checkExpression(node.expression)
      return
    }
    report(node, `disallowed expression (${kindName(node)})`)
  }

  // Pass 2: validate every top-level statement.
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const specifier = statement.moduleSpecifier
      if (
        !ts.isStringLiteral(specifier) ||
        (specifier.text !== 'zod' && !SAME_DIR_MODULE.test(specifier.text))
      ) {
        report(
          statement,
          'imports must come from zod or a same-directory .js module',
        )
      }
      if (statement.attributes) {
        report(statement, 'import attributes are not allowed')
      }
      if (!statement.importClause) {
        report(statement, 'side-effect-only imports are not allowed')
      } else if (statement.importClause.name) {
        report(statement, 'default imports are not allowed')
      }
    } else if (ts.isExportDeclaration(statement)) {
      const specifier = statement.moduleSpecifier
      if (
        !specifier ||
        !ts.isStringLiteral(specifier) ||
        !SAME_DIR_MODULE.test(specifier.text)
      ) {
        report(statement, 're-exports must target a same-directory .js module')
      }
    } else if (ts.isVariableStatement(statement)) {
      for (const modifier of statement.modifiers ?? []) {
        if (modifier.kind !== ts.SyntaxKind.ExportKeyword) {
          report(statement, `disallowed modifier (${kindName(modifier)})`)
        }
      }
      if (!(statement.declarationList.flags & ts.NodeFlags.Const)) {
        report(statement, 'only const declarations are allowed')
      }
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) {
          report(declaration, 'destructuring declarations are not allowed')
        }
        if (!declaration.initializer) {
          report(declaration, 'declarations must have an initializer')
        } else {
          checkExpression(declaration.initializer)
        }
      }
    } else if (
      ts.isTypeAliasDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement)
    ) {
      // Erased at runtime; nothing to execute.
    } else {
      report(
        statement,
        `disallowed top-level statement (${kindName(statement)})`,
      )
    }
  }

  return violations
}

export function verifyProvidersDir(providersDir: string): VerifyResult {
  let fileCount = 0
  const violations: Array<string> = []

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
        continue
      }
      const relativePath = relative(providersDir, fullPath)
      if (!entry.name.endsWith('.ts')) {
        violations.push(
          `${relativePath}:1 non-TypeScript file under src/providers is not allowed`,
        )
        continue
      }
      fileCount += 1
      violations.push(
        ...verifyGeneratedSource(relativePath, readFileSync(fullPath, 'utf8')),
      )
    }
  }

  walk(providersDir)
  return { fileCount, violations }
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  const providersDir = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'src',
    'providers',
  )
  const { fileCount, violations } = verifyProvidersDir(providersDir)
  if (violations.length > 0) {
    console.error(
      `verify-generated: ${violations.length} violation(s) across ${fileCount} files:\n`,
    )
    for (const violation of violations) console.error(`  ${violation}`)
    process.exit(1)
  }
  console.log(`verify-generated: ${fileCount} generated files are data-only ✓`)
}
