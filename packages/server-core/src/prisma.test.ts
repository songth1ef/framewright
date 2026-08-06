import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { PrismaClient } from '@prisma/client'
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

  it('libSQL adapter 支持现有的 Json 字段与交互式事务', async () => {
    const client = new PrismaClient({
      adapter: new PrismaLibSQL({ url: 'file::memory:' }),
    })

    try {
      await client.$executeRawUnsafe(`CREATE TABLE "Project" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "coverAssetId" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      )`)
      await client.$executeRawUnsafe(`CREATE TABLE "Document" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "projectId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "root" JSONB NOT NULL,
        "historySeq" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      )`)

      const document = await client.$transaction(async (transaction) => {
        await transaction.project.create({ data: { id: 'libsql-project', name: 'libSQL 测试' } })
        await transaction.document.create({
          data: {
            id: 'libsql-document',
            projectId: 'libsql-project',
            name: 'libSQL 画布',
            root: { fwId: 'root', fwType: 'frame', children: [] },
          },
        })
        return transaction.document.findUniqueOrThrow({ where: { id: 'libsql-document' } })
      })

      expect(document).toMatchObject({
        projectId: 'libsql-project',
        root: { fwId: 'root', fwType: 'frame', children: [] },
      })
    } finally {
      await client.$disconnect()
    }
  })
})
