import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // workspace 包以 TS 源码形式发布，交给 Next 转译
  transpilePackages: [
    '@framewright/core',
    '@framewright/renderer-dom',
    '@framewright/renderer-leafer',
  ],
}

export default nextConfig
