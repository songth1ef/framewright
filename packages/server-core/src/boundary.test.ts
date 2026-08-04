import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

interface PackageManifest {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

describe('server-core package boundary', () => {
  it('生产源码与包依赖均不接触 Next、Request 或 Response', () => {
    const sourceDirectory = fileURLToPath(new URL('.', import.meta.url))
    const productionSource = readdirSync(sourceDirectory)
      .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
      .map((name) => readFileSync(new URL(name, import.meta.url), 'utf8'))
      .join('\n')
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as PackageManifest
    const dependencyNames = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
    })

    expect(productionSource).not.toMatch(/from\s+['"]next(?:\/|['"])/)
    expect(productionSource).not.toMatch(/\b(?:Request|Response)\b/)
    expect(dependencyNames).not.toContain('next')
  })
})
