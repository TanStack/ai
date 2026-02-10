import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { glob } from 'tinyglobby'

const WRONG_VERSION = '1.0.0'

interface PackageToFix {
  name: string
  packageJsonPath: string
  changelogPath: string
  detectedVersion: string | null
}

function parseArgs(): { version: string | null } {
  const args = process.argv.slice(2)
  const versionIndex = args.findIndex(
    (arg) => arg === '--version' || arg === '-v',
  )

  if (versionIndex !== -1 && args[versionIndex + 1]) {
    return { version: args[versionIndex + 1] }
  }

  return { version: null }
}

function detectVersionFromChangelog(changelogPath: string): string | null {
  try {
    const content = readFileSync(changelogPath, 'utf-8')

    // Look for "Updated dependencies" section and extract version numbers
    // Pattern: - @tanstack/package-name@X.Y.Z
    const dependencyPattern = /-\s+@tanstack\/[\w-]+@(\d+\.\d+\.\d+)/g
    const matches = [...content.matchAll(dependencyPattern)]

    if (matches.length > 0) {
      // Get the first dependency version (they should all be the same in a changeset bump)
      const version = matches[0][1]
      // Make sure it's not also 1.0.0
      if (version !== WRONG_VERSION) {
        return version
      }
    }

    return null
  } catch {
    return null
  }
}

function fixPackageJson(path: string, newVersion: string): void {
  const content = readFileSync(path, 'utf-8')
  const updated = content.replace(
    /"version":\s*"1\.0\.0"/,
    `"version": "${newVersion}"`,
  )
  writeFileSync(path, updated)
}

function fixChangelog(path: string, newVersion: string): void {
  const content = readFileSync(path, 'utf-8')
  // Replace the first occurrence of "## 1.0.0" with the correct version
  const updated = content.replace(/^## 1\.0\.0$/m, `## ${newVersion}`)
  writeFileSync(path, updated)
}

async function main() {
  const { version: cliVersion } = parseArgs()

  console.log('🔍 Scanning for packages with version 1.0.0...\n')

  // Find all package.json files in packages/typescript
  const packageJsonFiles = await glob('packages/typescript/*/package.json', {
    ignore: ['**/node_modules/**'],
  })

  const packagesToFix: PackageToFix[] = []

  for (const packageJsonPath of packageJsonFiles) {
    try {
      const content = readFileSync(packageJsonPath, 'utf-8')
      const pkg = JSON.parse(content)

      if (pkg.version === WRONG_VERSION) {
        const changelogPath = packageJsonPath.replace(
          'package.json',
          'CHANGELOG.md',
        )
        const detectedVersion = detectVersionFromChangelog(changelogPath)

        packagesToFix.push({
          name: pkg.name,
          packageJsonPath,
          changelogPath,
          detectedVersion,
        })
      }
    } catch {
      // Skip files that can't be parsed
    }
  }

  if (packagesToFix.length === 0) {
    console.log('✅ No packages found with version 1.0.0. Nothing to fix!')
    process.exit(0)
  }

  console.log(`Found ${packagesToFix.length} package(s) with version 1.0.0:\n`)

  const errors: string[] = []

  for (const pkg of packagesToFix) {
    const targetVersion = cliVersion || pkg.detectedVersion

    if (!targetVersion) {
      errors.push(pkg.name)
      console.log(`  ❌ ${pkg.name} - could not auto-detect version`)
    } else {
      console.log(`  📦 ${pkg.name} → ${targetVersion}`)
    }
  }

  if (errors.length > 0) {
    console.log('\n❌ Could not auto-detect version for some packages.')
    console.log('   Please run with an explicit version:\n')
    console.log('   node scripts/fix-version-bump.ts --version X.Y.Z\n')
    process.exit(1)
  }

  console.log('\n🔧 Fixing versions...\n')

  for (const pkg of packagesToFix) {
    const targetVersion = cliVersion || pkg.detectedVersion!

    // Fix package.json
    fixPackageJson(pkg.packageJsonPath, targetVersion)
    console.log(`  ✓ ${pkg.packageJsonPath}`)

    // Fix CHANGELOG.md
    try {
      fixChangelog(pkg.changelogPath, targetVersion)
      console.log(`  ✓ ${pkg.changelogPath}`)
    } catch {
      console.log(`  ⚠ ${pkg.changelogPath} (not found or could not update)`)
    }
  }

  console.log('\n✅ Done! Version bump fixed.')
  console.log('\nNext steps:')
  console.log('  1. Review the changes: git diff')
  console.log(
    '  2. Commit: git add -A && git commit -m "fix: correct version bump to X.Y.Z"',
  )
}

main().catch(console.error)
