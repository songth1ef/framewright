import type { PrismaClient } from '@prisma/client'
import { createPrismaClient } from './prisma'

/**
 * 测试用内存库。建出与 prisma/migrations 最终态一致的表结构，
 * 每个测试文件各开一份 ':memory:' 实例，互不干扰。
 */
export async function createTestPrismaClient(): Promise<PrismaClient> {
  const client = createPrismaClient(':memory:')
  for (const statement of SCHEMA_STATEMENTS) {
    await client.$executeRawUnsafe(statement)
  }
  return client
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "coverAssetId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "root" JSONB NOT NULL,
    "historySeq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Document_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX "Document_projectId_idx" ON "Document"("projectId")`,
  `CREATE TABLE "HistoryEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "op" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HistoryEntry_documentId_fkey"
      FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX "HistoryEntry_documentId_seq_key" ON "HistoryEntry"("documentId", "seq")`,
  `CREATE INDEX "HistoryEntry_documentId_idx" ON "HistoryEntry"("documentId")`,
  `CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Session_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX "Session_projectId_idx" ON "Session"("projectId")`,
  `CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "generationIds" JSONB NOT NULL,
    "nodeFwIds" JSONB NOT NULL,
    "documentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX "Message_sessionId_seq_key" ON "Message"("sessionId", "seq")`,
  `CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "generationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Asset_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX "Asset_projectId_idx" ON "Asset"("projectId")`,
  `CREATE INDEX "Asset_generationId_idx" ON "Asset"("generationId")`,
  `CREATE TABLE "Generation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sessionId" TEXT,
    "messageId" TEXT,
    "status" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "inputAssetIds" JSONB NOT NULL,
    "outputAssetIds" JSONB NOT NULL,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME
  )`,
  `CREATE INDEX "Generation_projectId_idx" ON "Generation"("projectId")`,
  `CREATE INDEX "Generation_documentId_idx" ON "Generation"("documentId")`,
  `CREATE INDEX "Generation_messageId_idx" ON "Generation"("messageId")`,
]
