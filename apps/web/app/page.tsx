'use client'

import dynamic from 'next/dynamic'

// LeaferJS 是纯客户端库，需要真实 canvas；关闭 SSR 避免服务端求值
const RendererHost = dynamic(
  () => import('@/components/renderer-host').then((m) => m.RendererHost),
  { ssr: false },
)

export default function Page() {
  return <RendererHost />
}
