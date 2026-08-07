/**
 * 对 Turso / libSQL 执行 Prisma 迁移。
 *
 * 🔴 为什么需要它：Prisma Migrate **无法**对 Turso 执行 —— 它校验 sqlite provider
 * 的 URL 必须以 `file:` 开头，`libsql://` 直接报 P1012。2026-08-06 首次上线时，
 * 线上 7 张表是用 `turso db shell < migration.sql` 手工灌的。
 *
 * 代价当时就记下了：线上库没有 `_prisma_migrations` 表，Prisma 不知道迁到哪一版，
 * 下次加迁移仍需手工灌、且**没有漂移检测** —— 有人改了已应用的 migration.sql
 * 也不会有任何人发现。这个脚本把那条链路补上。
 *
 * 用法：
 *   DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... node tools/turso-migrate.mjs
 *   node tools/turso-migrate.mjs --dry-run    # 只打印将要应用哪些，不写库
 *
 * 幂等：已应用的跳过，跑两次结果一样。
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(repoRoot, 'prisma', 'migrations')

/** 与 Prisma 自己建的表结构一致，这样将来若能用官方工具也不会打架。 */
const CREATE_MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "checksum" TEXT NOT NULL,
  "finished_at" DATETIME,
  "migration_name" TEXT NOT NULL,
  "logs" TEXT,
  "rolled_back_at" DATETIME,
  "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
  "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
)`

export function checksumOf(sql) {
  return createHash('sha256').update(sql).digest('hex')
}

/**
 * 切分一份 migration.sql 为可逐条执行的语句。
 *
 * ⚠️ 不能简单按 `;` 切：字符串字面量与注释里都可能有分号。这里做最小可用的
 * 状态机 —— 跳过 `--` 行注释、`/* *​/` 块注释与单双引号字符串。
 * Prisma 生成的 DDL 不含存储过程之类需要 DELIMITER 的结构，这个粒度够用。
 */
export function splitSqlStatements(sql) {
  const statements = []
  let current = ''
  let index = 0
  let inLine = false
  let inBlock = false
  let quote = null

  while (index < sql.length) {
    const char = sql[index]
    const next = sql[index + 1]

    if (inLine) {
      if (char === '\n') inLine = false
      current += char
      index += 1
      continue
    }
    if (inBlock) {
      if (char === '*' && next === '/') { inBlock = false; current += '*/'; index += 2; continue }
      current += char
      index += 1
      continue
    }
    if (quote !== null) {
      current += char
      // SQL 里连续两个引号表示转义的引号本身
      if (char === quote) {
        if (next === quote) { current += next; index += 2; continue }
        quote = null
      }
      index += 1
      continue
    }
    if (char === '-' && next === '-') { inLine = true; current += '--'; index += 2; continue }
    if (char === '/' && next === '*') { inBlock = true; current += '/*'; index += 2; continue }
    if (char === "'" || char === '"') { quote = char; current += char; index += 1; continue }
    if (char === ';') {
      if (current.trim().length > 0) statements.push(current.trim())
      current = ''
      index += 1
      continue
    }
    current += char
    index += 1
  }
  if (current.trim().length > 0) statements.push(current.trim())
  // 只剩注释的片段不算语句
  return statements.filter((statement) => stripComments(statement).trim().length > 0)
}

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '')
}

/** 按目录名升序读取全部迁移。目录名带时间戳前缀，字典序即时间序。 */
export function readMigrations(dir = migrationsDir) {
  return readdirSync(dir)
    .filter((name) => statSync(path.join(dir, name)).isDirectory())
    .sort()
    .map((name) => {
      const sql = readFileSync(path.join(dir, name, 'migration.sql'), 'utf8')
      return { name, sql, checksum: checksumOf(sql), statements: splitSqlStatements(sql) }
    })
}

/**
 * 核心流程。抽成纯函数便于用内存库测试。
 *
 * `client` 只需提供 `execute({ sql, args })`，与 @libsql/client 的接口一致。
 */
export async function migrate(client, { migrations, dryRun = false, now = () => new Date() } = {}) {
  const list = migrations ?? readMigrations()
  await client.execute({ sql: CREATE_MIGRATIONS_TABLE, args: [] })

  const applied = await client.execute({
    sql: 'SELECT migration_name, checksum FROM "_prisma_migrations" WHERE rolled_back_at IS NULL',
    args: [],
  })
  const appliedByName = new Map(
    (applied.rows ?? []).map((row) => [
      String(row.migration_name ?? row[0]),
      String(row.checksum ?? row[1]),
    ]),
  )

  // 🔴 漂移检测先于任何写入：已应用的迁移内容变了，说明历史与代码已经对不上。
  // 这时候继续往下灌新迁移，只会把两份不一致的状态叠得更深。明确失败、指出是哪一个。
  const drifted = []
  for (const migration of list) {
    const recorded = appliedByName.get(migration.name)
    if (recorded !== undefined && recorded !== migration.checksum) {
      drifted.push({ name: migration.name, recorded, actual: migration.checksum })
    }
  }
  if (drifted.length > 0) {
    const detail = drifted
      .map((d) => `  ${d.name}\n    已记录 ${d.recorded}\n    当前   ${d.actual}`)
      .join('\n')
    throw new Error(
      `检测到迁移漂移：以下迁移已应用过，但文件内容已变更。\n${detail}\n` +
        '已应用的迁移不该再改。请新增一个迁移来表达变更，而不是修改历史。',
    )
  }

  const pending = list.filter((migration) => !appliedByName.has(migration.name))
  if (dryRun) return { applied: [], pending: pending.map((m) => m.name), dryRun: true }

  const appliedNow = []
  for (const migration of pending) {
    const startedAt = now().toISOString()
    for (const statement of migration.statements) {
      await client.execute({ sql: statement, args: [] })
    }
    await client.execute({
      sql: 'INSERT INTO "_prisma_migrations" '
        + '(id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) '
        + 'VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)',
      args: [
        `${migration.name}-${migration.checksum.slice(0, 8)}`,
        migration.checksum,
        now().toISOString(),
        migration.name,
        startedAt,
        migration.statements.length,
      ],
    })
    appliedNow.push(migration.name)
  }
  return { applied: appliedNow, pending: [], dryRun: false }
}

/**
 * 把已存在的表登记为「已应用」。
 *
 * 用于 2026-08-06 那次手工灌 SQL 留下的历史：表已经在了，但没有版本记录。
 * 直接跑迁移会因为 `CREATE TABLE` 冲突而失败，所以提供这条补登记路径。
 */
export async function baseline(client, { migrations, now = () => new Date() } = {}) {
  const list = migrations ?? readMigrations()
  await client.execute({ sql: CREATE_MIGRATIONS_TABLE, args: [] })
  const applied = await client.execute({
    sql: 'SELECT migration_name FROM "_prisma_migrations"',
    args: [],
  })
  const known = new Set((applied.rows ?? []).map((row) => String(row.migration_name ?? row[0])))
  const recorded = []
  for (const migration of list) {
    if (known.has(migration.name)) continue
    const stamp = now().toISOString()
    await client.execute({
      sql: 'INSERT INTO "_prisma_migrations" '
        + '(id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) '
        + 'VALUES (?, ?, ?, ?, ?, NULL, ?, ?)',
      args: [
        `${migration.name}-${migration.checksum.slice(0, 8)}`,
        migration.checksum,
        stamp,
        migration.name,
        'baseline: 表由 turso db shell 手工灌入,此处仅补登记版本',
        stamp,
        migration.statements.length,
      ],
    })
    recorded.push(migration.name)
  }
  return { recorded }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const isBaseline = process.argv.includes('--baseline')
  const url = process.env['DATABASE_URL']
  const authToken = process.env['TURSO_AUTH_TOKEN']

  // 明确指出缺哪一个 —— 「连接失败」这种笼统报错会让人从网络开始查起。
  if (url === undefined || url === '') {
    throw new Error('缺少 DATABASE_URL 环境变量')
  }
  if (!url.startsWith('libsql:') && !url.startsWith('http')) {
    throw new Error(`本脚本只用于 libSQL / Turso；本地 file: 请用 pnpm db:deploy。收到：${url}`)
  }
  if (authToken === undefined || authToken === '') {
    throw new Error('缺少 TURSO_AUTH_TOKEN 环境变量')
  }

  const { createClient } = await import('@libsql/client')
  const client = createClient({ url, authToken })
  try {
    if (isBaseline) {
      const { recorded } = await baseline(client)
      console.log(recorded.length === 0 ? '无需补登记' : `已补登记：${recorded.join(', ')}`)
      return
    }
    const result = await migrate(client, { dryRun })
    if (result.dryRun) {
      console.log(result.pending.length === 0 ? '没有待应用的迁移' : `待应用：${result.pending.join(', ')}`)
      return
    }
    console.log(result.applied.length === 0 ? '没有待应用的迁移' : `已应用：${result.applied.join(', ')}`)
  } finally {
    client.close?.()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
