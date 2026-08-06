import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
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
