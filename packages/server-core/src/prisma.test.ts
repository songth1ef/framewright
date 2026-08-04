import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createPrismaClient } from './prisma'

const originalCwd = process.cwd()
const originalDatabaseUrl = process.env['DATABASE_URL']
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

afterEach(() => {
  process.chdir(originalCwd)
  if (originalDatabaseUrl === undefined) {
    delete process.env['DATABASE_URL']
  } else {
    process.env['DATABASE_URL'] = originalDatabaseUrl
  }
})

describe('createPrismaClient', () => {
  it('默认数据库在非仓库根 cwd 下仍可连接', async () => {
    delete process.env['DATABASE_URL']
    process.chdir(path.join(repositoryRoot, 'apps/web'))
    const client = createPrismaClient()

    try {
      await expect(client.document.count()).resolves.toBeGreaterThanOrEqual(0)
    } finally {
      await client.$disconnect()
    }
  })
})
