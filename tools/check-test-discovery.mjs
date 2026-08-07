#!/usr/bin/env node
/**
 * 门禁：磁盘上存在的测试文件，必须每一个都被 vitest 真的发现。
 *
 * 为什么需要这道防线 —— 同一类事故本仓已经发生两次：
 *
 * 1. `apps/web/**` 的 include glob 里写了字面量 `[id]`，方括号被解释成字符集，
 *    `app/api/documents/[id]/route.test.ts` 永远匹配不上 —— 17 条测试静默不跑。
 * 2. 新建 `packages/provider` 后忘了往根 `vitest.config.ts` 的 projects 里加一项 ——
 *    8 条测试静默不跑。
 *
 * 两次的共同点：**测试是绿的，因为它根本没跑。** 全量 verify 通过反而给了虚假信心。
 * 单靠"记得改配置"防不住，所以把它变成机器检查。
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// tools/ 也纳入扫描：2026-08-07 新增 turso-migrate 时发现它不在扫描根里，
// 放在那里的测试会被门禁判为漏网而无人察觉。
const SCAN_ROOTS = ['packages', 'apps', 'tools']
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', 'coverage', '.turbo'])
const TEST_FILE = /\.test\.(ts|tsx)$/

/** @returns {string[]} 仓库相对、正斜杠分隔的测试文件路径 */
function scanTestFiles(dir) {
  const found = []
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return found
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      found.push(...scanTestFiles(full))
    } else if (TEST_FILE.test(entry)) {
      found.push(path.relative(repoRoot, full).replaceAll('\\', '/'))
    }
  }
  return found
}

const onDisk = SCAN_ROOTS.flatMap((root) => scanTestFiles(path.join(repoRoot, root)))

// vitest list --filesOnly 输出发现到的文件，每行一个（可能是绝对路径）
const listed = execFileSync('npx', ['vitest', 'list', '--filesOnly'], {
  cwd: repoRoot,
  encoding: 'utf8',
  shell: process.platform === 'win32',
})

const discovered = new Set(
  listed
    .split('\n')
    // 每行形如 `[project-name] packages/core/src/foo.test.ts`，先剥掉 project 前缀
    .map((line) => line.trim().replace(/^\[[^\]]*\]\s*/, ''))
    .filter((line) => TEST_FILE.test(line))
    .map((line) => {
      const absolute = path.isAbsolute(line) ? line : path.join(repoRoot, line)
      return path.relative(repoRoot, absolute).replaceAll('\\', '/')
    }),
)

const missing = onDisk.filter((file) => !discovered.has(file)).sort()

if (missing.length > 0) {
  console.error(
    `\n✗ 有 ${missing.length} 个测试文件存在于磁盘，但 vitest 没有发现它们 —— 它们永远不会跑：\n`,
  )
  for (const file of missing) console.error(`    ${file}`)
  console.error(
    '\n通常是根 vitest.config.ts 的 projects 缺了对应项，' +
      '或者 include glob 写错了（注意：路径里的方括号会被当成字符集，' +
      '动态路由目录必须由 ** 匹配，不能写字面量 [id]）。\n',
  )
  process.exit(1)
}

console.log(`✓ ${onDisk.length} 个测试文件全部被 vitest 发现`)
