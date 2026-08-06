import { PrismaBetterSQLite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { PrismaClient } from '@prisma/client'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDirectory = path.dirname(fileURLToPath(import.meta.url))
const defaultDatabasePath = path.resolve(packageDirectory, '../../../prisma/dev.db')
const DEFAULT_DATABASE_URL = `file:${defaultDatabasePath.replaceAll('\\', '/')}`

export function createPrismaClient(
  databaseUrl = process.env['DATABASE_URL'] ?? DEFAULT_DATABASE_URL,
): PrismaClient {
  if (databaseUrl.startsWith('file:') || databaseUrl === ':memory:') {
    return new PrismaClient({ adapter: new PrismaBetterSQLite3({ url: databaseUrl }) })
  }

  if (
    databaseUrl.startsWith('libsql:') ||
    databaseUrl.startsWith('http:') ||
    databaseUrl.startsWith('https:')
  ) {
    return new PrismaClient({
      adapter: new PrismaLibSQL({
        url: databaseUrl,
        authToken: process.env['TURSO_AUTH_TOKEN'],
      }),
    })
  }

  throw new Error('不支持的 DATABASE_URL 协议：仅支持 file:、libsql:、http: 和 https:')
}

export const prisma = createPrismaClient()
