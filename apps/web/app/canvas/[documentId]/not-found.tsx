import Link from 'next/link'

export default function NotFound() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1 data-testid="document-not-found">画布不存在</h1>
      <p>它可能已被删除，或链接不正确。</p>
      <Link href="/">返回画布列表</Link>
    </main>
  )
}
