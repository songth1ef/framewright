import { execFileSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** e2e 专用库的绝对路径。必须是绝对路径 —— Next dev 的 cwd 是 `apps/web` 不是仓库根。 */
export const E2E_DATABASE_PATH = path.join(repoRoot, 'prisma', 'e2e.db')
export const E2E_DATABASE_URL = `file:${E2E_DATABASE_PATH.replaceAll('\\', '/')}`

/**
 * 删文件；被占用（Windows 上 dev server 常仍持有句柄）时返回 false，由调用方降级清表。
 */
function tryRemoveDatabaseFiles(): boolean {
  try {
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      const file = `${E2E_DATABASE_PATH}${suffix}`
      if (existsSync(file)) rmSync(file)
    }
    return true
  } catch {
    return false
  }
}

/** 清空所有业务表。用于文件删不掉时的降级路径 —— 效果等价（空库），且不碰文件锁。 */
function truncateAllTables(): void {
  const db = new Database(E2E_DATABASE_PATH)
  try {
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'`,
      )
      .all() as { name: string }[]
    db.pragma('foreign_keys = OFF')
    const wipe = db.transaction(() => {
      for (const { name } of tables) db.prepare(`DELETE FROM "${name}"`).run()
    })
    wipe()
    db.pragma('foreign_keys = ON')
  } finally {
    db.close()
  }
}

/**
 * 每次 e2e 之前把专用库恢复成空库。
 *
 * 为什么需要：e2e 会不断 `POST /api/documents` 造新画布，而它原先与开发共用
 * `prisma/dev.db`。文档越堆越多，首页列表越来越长，**最终把首页那个 demo 画布
 * 推出视口** —— 于是一批依赖 demo 节点的用例开始失败（实测堆到 27 个文档时挂了 12 条），
 * 且失败信息（「节点没移动」）完全指不到真正的原因（「库里堆了 27 个文档」）。
 *
 * 这个坑此前被绕过一次（临时换干净副本跑），但没做成常态，于是复发。
 * 隔离数据库是根治：e2e 永远从空库开始，跑多少次都一样。
 */
/**
 * 预热首页与文档 API。
 *
 * 🔴 为什么必须做：Next dev 是按需编译的，首次命中某个 Route Handler 会当场编译。
 * 而 `createDocument` 点完就 `await expect(page).toHaveURL(...)`，用的是 Playwright
 * 默认的 5 秒断言超时。冷编译在 CPU 被占（例如同时开着另一个 dev server）时轻易超过
 * 5 秒，于是**每轮里第一个创建文档的用例随机变红**，而报错只说「URL 还停在首页」，
 * 完全指不到「Route Handler 正在编译」上。
 *
 * 实测抖动：同一份代码连跑三轮，失败 7 条 / 0 条 / 1 条，失败全部落在
 * `create-document.ts:21`。
 *
 * 预热把编译移出关键路径。这比「把断言超时调大」更好 —— 后者会顺带放宽对真实
 * 回归的检测，而这里要治的只是首次编译。
 */
async function warmUpRoutes(): Promise<void> {
  const port = process.env['FRAMEWRIGHT_E2E_PORT'] ?? '3100'
  const baseUrl = `http://localhost:${port}`
  for (const target of ['/', '/api/documents']) {
    try {
      await fetch(`${baseUrl}${target}`)
    } catch {
      // 预热失败不该让整轮 e2e 挂掉：它只是省掉首次编译，不是正确性前提。
    }
  }
}

export default async function globalSetup(): Promise<void> {
  const removed = tryRemoveDatabaseFiles()

  execFileSync(
    'node',
    ['tools/prisma.mjs', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
    {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
      stdio: 'inherit',
    },
  )

  // 文件没删成（被占用）时，迁移不会重建表，库里还留着上一轮的数据 —— 清表补上。
  if (!removed) truncateAllTables()

  // 放在最后：预热要打到已经建好表的库上，否则首页会 500，等于没热到真实路径。
  await warmUpRoutes()
}
