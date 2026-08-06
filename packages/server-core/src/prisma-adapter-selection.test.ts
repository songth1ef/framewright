import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const adapterMocks = vi.hoisted(() => ({
  betterSqlite: vi.fn(),
  libsql: vi.fn(),
  prismaClient: vi.fn(),
}))

vi.mock('@prisma/adapter-better-sqlite3', () => ({
  PrismaBetterSQLite3: adapterMocks.betterSqlite,
}))

vi.mock('@prisma/adapter-libsql', () => ({
  PrismaLibSQL: adapterMocks.libsql,
}))

vi.mock('@prisma/client', () => ({
  PrismaClient: adapterMocks.prismaClient,
}))

import { createPrismaClient } from './prisma'

const originalTursoAuthToken = process.env['TURSO_AUTH_TOKEN']

beforeEach(() => {
  vi.clearAllMocks()
  process.env['TURSO_AUTH_TOKEN'] = 'test-token'
})

afterEach(() => {
  if (originalTursoAuthToken === undefined) {
    delete process.env['TURSO_AUTH_TOKEN']
  } else {
    process.env['TURSO_AUTH_TOKEN'] = originalTursoAuthToken
  }
})

describe('createPrismaClient adapter 选择', () => {
  it.each(['file:C:/tmp/framewright.db', ':memory:'])(
    '%s 使用 better-sqlite3 adapter',
    (databaseUrl) => {
      createPrismaClient(databaseUrl)

      expect(adapterMocks.betterSqlite).toHaveBeenCalledWith({ url: databaseUrl })
      expect(adapterMocks.libsql).not.toHaveBeenCalled()
    },
  )

  it.each(['libsql://framewright.turso.io', 'https://framewright.turso.io'])(
    '%s 使用 libSQL adapter 和 Turso token',
    (databaseUrl) => {
      createPrismaClient(databaseUrl)

      expect(adapterMocks.libsql).toHaveBeenCalledWith({
        url: databaseUrl,
        authToken: 'test-token',
      })
      expect(adapterMocks.betterSqlite).not.toHaveBeenCalled()
    },
  )

  it('拒绝未支持的数据库 URL 协议', () => {
    expect(() => createPrismaClient('postgresql://localhost/framewright')).toThrow(
      '不支持的 DATABASE_URL 协议',
    )
  })
})
