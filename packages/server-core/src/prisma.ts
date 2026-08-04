import { PrismaBetterSQLite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '@prisma/client'

const DEFAULT_DATABASE_URL = 'file:./prisma/dev.db'

export function createPrismaClient(
  databaseUrl = process.env['DATABASE_URL'] ?? DEFAULT_DATABASE_URL,
): PrismaClient {
  const adapter = new PrismaBetterSQLite3({ url: databaseUrl })
  return new PrismaClient({ adapter })
}

export const prisma = createPrismaClient()
