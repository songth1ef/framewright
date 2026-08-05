#!/usr/bin/env node
/**
 * Prisma CLI 包装：把 `DATABASE_URL` 的默认值与运行时对齐后再转发给 prisma。
 *
 * 为什么需要它 ——
 *
 * `schema.prisma` 原先把 url 写死成 `file:./dev.db`（相对 `prisma/` 目录），
 * 而运行时 `server-core/prisma.ts` 用的是**仓库根的绝对路径**并支持 `DATABASE_URL` 覆盖。
 * 两处口径不同，后果有二：
 *
 * 1. CLI 完全无视 `DATABASE_URL`，导致 e2e 无法切到自己的库（隔离做不成）。
 * 2. 这正是当初那个首页 500 的同类毛病：**同一个数据库路径由不同代码各算各的**，
 *    平时碰巧一致，换个 cwd 或换个场景就炸，而报错信息完全指不到路径上。
 *
 * 现在 schema 改成 `env("DATABASE_URL")`，由本脚本提供与运行时一致的默认值，
 * 单一口径。用法：`node tools/prisma.mjs migrate deploy --schema prisma/schema.prisma`
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 与 `packages/server-core/src/prisma.ts` 的默认值保持一致：仓库根的绝对路径、正斜杠。 */
const defaultDatabasePath = path.join(repoRoot, 'prisma', 'dev.db')
const DEFAULT_DATABASE_URL = `file:${defaultDatabasePath.replaceAll('\\', '/')}`

const result = spawnSync('npx', ['prisma', ...process.argv.slice(2)], {
  cwd: repoRoot,
  env: { ...process.env, DATABASE_URL: process.env['DATABASE_URL'] ?? DEFAULT_DATABASE_URL },
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

process.exit(result.status ?? 1)
