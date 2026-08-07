import { createClient } from '@libsql/client'
import { beforeEach, describe, expect, it } from 'vitest'
// @ts-expect-error -- 纯 JS 工具脚本，没有类型声明；这里刻意直接测实现而不是包一层。
import { baseline, checksumOf, migrate, splitSqlStatements } from './turso-migrate.mjs'

/**
 * 用**内存 libSQL** 跑真实 SQL，不 mock client。
 * mock 掉执行层就测不到「语句切分对不对」「表真的建出来没有」这两件最要紧的事。
 */
function memoryClient() {
  return createClient({ url: ':memory:' })
}

const MIGRATIONS = [
  {
    name: '20260101000000_init',
    sql: 'CREATE TABLE "A" ("id" TEXT PRIMARY KEY);\nCREATE TABLE "B" ("id" TEXT PRIMARY KEY);',
  },
  {
    name: '20260102000000_more',
    sql: 'CREATE TABLE "C" ("id" TEXT PRIMARY KEY);',
  },
].map((m) => ({
  ...m,
  checksum: checksumOf(m.sql),
  statements: splitSqlStatements(m.sql),
}))

async function tableNames(client: ReturnType<typeof memoryClient>): Promise<string[]> {
  const result = await client.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    args: [],
  })
  return result.rows.map((row) => String(row['name']))
}

describe('Turso 迁移', () => {
  let client: ReturnType<typeof memoryClient>
  beforeEach(() => { client = memoryClient() })

  describe('语句切分', () => {
    it('按分号切分多条语句', () => {
      expect(splitSqlStatements('CREATE TABLE a(x);\nCREATE TABLE b(y);')).toHaveLength(2)
    })

    // 🔴 简单 split(';') 会在这里切错 —— 字符串字面量与注释里的分号不是语句边界。
    it('不被字符串字面量与注释里的分号切断', () => {
      const sql = `INSERT INTO t VALUES ('a;b');
-- 注释里有分号 ; 不算
/* 块注释也有 ; */
CREATE TABLE u(x);`
      const statements = splitSqlStatements(sql)
      expect(statements).toHaveLength(2)
      expect(statements[0]).toContain("'a;b'")
    })

    it('只含注释的片段不算语句', () => {
      expect(splitSqlStatements('-- 只有注释\n;')).toHaveLength(0)
    })
  })

  it('首次运行应用全部迁移并建出表', async () => {
    const result = await migrate(client, { migrations: MIGRATIONS })
    expect(result.applied).toEqual(['20260101000000_init', '20260102000000_more'])
    expect(await tableNames(client)).toEqual(['A', 'B', 'C', '_prisma_migrations'])
  })

  it('幂等：再跑一次不重复应用', async () => {
    await migrate(client, { migrations: MIGRATIONS })
    const second = await migrate(client, { migrations: MIGRATIONS })
    expect(second.applied).toEqual([])
    const rows = await client.execute({
      sql: 'SELECT COUNT(*) AS n FROM "_prisma_migrations"', args: [],
    })
    expect(Number(rows.rows[0]!['n'])).toBe(2)
  })

  it('只应用尚未应用的那些', async () => {
    await migrate(client, { migrations: [MIGRATIONS[0]!] })
    const second = await migrate(client, { migrations: MIGRATIONS })
    expect(second.applied).toEqual(['20260102000000_more'])
  })

  // 🔴 漂移必须明确失败:已应用的迁移内容变了,说明历史与代码对不上。
  // 这时继续灌新迁移只会把两份不一致的状态叠得更深。
  it('漂移检测：已应用的迁移内容变更时报错并指出是哪一个', async () => {
    await migrate(client, { migrations: MIGRATIONS })
    const tampered = [
      { ...MIGRATIONS[0]!, sql: 'CREATE TABLE "A" ("id" TEXT);', checksum: checksumOf('changed') },
      MIGRATIONS[1]!,
    ]
    await expect(migrate(client, { migrations: tampered })).rejects.toThrow(/迁移漂移/)
    await expect(migrate(client, { migrations: tampered })).rejects.toThrow(/20260101000000_init/)
  })

  it('漂移时不写入任何新迁移', async () => {
    await migrate(client, { migrations: [MIGRATIONS[0]!] })
    const tampered = [
      { ...MIGRATIONS[0]!, checksum: checksumOf('changed') },
      MIGRATIONS[1]!,
    ]
    await expect(migrate(client, { migrations: tampered })).rejects.toThrow()
    expect(await tableNames(client)).not.toContain('C')
  })

  it('dry-run 只列出待应用，不写库', async () => {
    const result = await migrate(client, { migrations: MIGRATIONS, dryRun: true })
    expect(result.pending).toEqual(['20260101000000_init', '20260102000000_more'])
    expect(await tableNames(client)).toEqual(['_prisma_migrations'])
  })

  describe('baseline 补登记', () => {
    // 对应 2026-08-06 手工灌 SQL 的历史:表已经在了,但没有版本记录。
    // 直接跑迁移会因 CREATE TABLE 冲突失败,所以要能只补登记。
    it('把已存在的迁移登记为已应用，不执行 SQL', async () => {
      await client.execute({ sql: 'CREATE TABLE "A" ("id" TEXT PRIMARY KEY)', args: [] })
      const { recorded } = await baseline(client, { migrations: MIGRATIONS })
      expect(recorded).toEqual(['20260101000000_init', '20260102000000_more'])
      // 没有执行 migration.sql,所以 B、C 不该被建出来
      expect(await tableNames(client)).toEqual(['A', '_prisma_migrations'])
    })

    it('补登记后再跑迁移不会重复应用', async () => {
      await baseline(client, { migrations: MIGRATIONS })
      const result = await migrate(client, { migrations: MIGRATIONS })
      expect(result.applied).toEqual([])
    })

    it('幂等：重复 baseline 不产生重复记录', async () => {
      await baseline(client, { migrations: MIGRATIONS })
      const { recorded } = await baseline(client, { migrations: MIGRATIONS })
      expect(recorded).toEqual([])
    })
  })
})
