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
  // Prisma 与 better-sqlite3（原生模块）不进服务端 bundle：
  // better-sqlite3 是 .node 原生模块打不进 bundle；
  // Prisma 6 的 client engine 用 WASM 查询编译器，被打包后解析不到 .wasm
  serverExternalPackages: [
    '@prisma/client',
    '@prisma/adapter-better-sqlite3',
    'better-sqlite3',
  ],
  webpack(config, { isServer }) {
    if (isServer) {
      // transpilePackages 内的静态依赖在 dev 模式下仍可能被打进 vendor chunks。
      // 强制保留 Node require，确保 Prisma WASM 与 SQLite 原生模块从原包加载。
      config.externals.push({
        '@prisma/client': 'commonjs @prisma/client',
        '@prisma/adapter-better-sqlite3': 'commonjs @prisma/adapter-better-sqlite3',
        'better-sqlite3': 'commonjs better-sqlite3',
      })
    }
    return config
  },
}

export default nextConfig
