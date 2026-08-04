import { PrismaBetterSQLite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '@prisma/client'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDirectory = path.dirname(fileURLToPath(import.meta.url))
const defaultDatabasePath = path.resolve(packageDirectory, '../../../prisma/dev.db')
const DEFAULT_DATABASE_URL = `file:${defaultDatabasePath.replaceAll('\\', '/')}`

export function createPrismaClient(
  databaseUrl = process.env['DATABASE_URL'] ?? DEFAULT_DATABASE_URL,
): PrismaClient {
  const adapter = new PrismaBetterSQLite3({ url: databaseUrl })
  return new PrismaClient({ adapter })
}

export const prisma = createPrismaClient()
