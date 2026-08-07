import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const appDirectory = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(appDirectory, '../..')

const nextConfig: NextConfig = {
  // 🔴 pnpm monorepo 必须显式指定，否则 Next 会顺着 lockfile 往上猜。
  // 本机曾因家目录里有一个游离的 package-lock.json 而把 workspace root 判成 ~/，
  // 部署时 tracing 会因此收错文件。
  outputFileTracingRoot: repoRoot,
  // Prisma 6 用 WASM 查询编译器，`.wasm` 不是静态 import —— tracing 看不见它，
  // 于是 serverless bundle 里缺文件，线上首页 500：
  //   ENOENT: ... /.prisma/client/query_compiler_bg.wasm
  // 这个坑只在真实部署里出现：本地 dev 直接从 node_modules 读，永远不会缺。
  // ⚠️ 这里的相对路径以 **next.config 所在目录**（apps/web）为基准，不是 tracing root。
  // 第一版写成 './node_modules/...' 指向了 apps/web/node_modules —— 那里没有 .pnpm，
  // 于是 include 静默匹配到 0 个文件，部署照样 500，报错和没加时一模一样。
  outputFileTracingIncludes: {
    '/**/*': [
      '../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/**/*',
      '../../node_modules/.prisma/client/**/*',
    ],
  },
  // workspace 包以 TS 源码形式发布，交给 Next 转译
  // ⚠️ server-core 也是 TS 源码包，必须在这里而不是 serverExternalPackages ——
  //    后者意味着「运行时原生 require」，而 Node 无法 require 一个 .ts 文件
  transpilePackages: [
    '@framewright/core',
    '@framewright/renderer-dom',
    '@framewright/renderer-leafer',
    '@framewright/server-core',
  ],
  // Prisma、SQLite 原生模块与 libSQL Node 客户端不进服务端 bundle：
  // better-sqlite3 / libsql 的本地驱动包含 .node 原生模块，不能打进 webpack bundle；
  // @libsql/client 的 Node 入口还会动态选择平台包，必须保留为运行时依赖。
  // Prisma 6 的 client engine 用 WASM 查询编译器，被打包后解析不到 .wasm
  serverExternalPackages: [
    '@prisma/client',
    '@prisma/adapter-better-sqlite3',
    '@prisma/adapter-libsql',
    '@libsql/client',
    'better-sqlite3',
    'libsql',
  ],
  webpack(config, { isServer }) {
    if (isServer) {
      // transpilePackages 内的静态依赖在 dev 模式下仍可能被打进 vendor chunks。
      // 强制保留 Node require，确保 Prisma WASM 与 SQLite 原生模块从原包加载。
      config.externals.push({
        '@prisma/client': 'commonjs @prisma/client',
        '@prisma/adapter-better-sqlite3': 'commonjs @prisma/adapter-better-sqlite3',
        '@prisma/adapter-libsql': 'commonjs @prisma/adapter-libsql',
        'better-sqlite3': 'commonjs better-sqlite3',
      })
    }
    return config
  },
}

export default nextConfig
