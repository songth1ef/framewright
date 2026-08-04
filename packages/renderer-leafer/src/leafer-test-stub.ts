/**
 * 单测环境桩（不是测试文件，不会被 vitest 当作 suite）。
 *
 * jsdom 没有 canvas 实现，而 leafer-ui 的 web 平台层在 import 与构造时
 * 会触碰这些浏览器 API。桩掉它们只为能在单测里**构造并检查 leafer 对象树**
 * （结构、属性、事件接线），不做任何真实渲染——几何与像素断言由 e2e（真实浏览器）负责。
 *
 * 🔴 任何要 import leafer-ui 的测试文件，必须把本模块作为**第一个 import**
 *    （ES 模块按 import 顺序求值，桩必须先于 leafer-ui 生效）。
 */

const g = globalThis as Record<string, unknown>

// canvas-web 平台层在模块加载时以这些类做基类/判断，jsdom 未实现
for (const name of ['CanvasRenderingContext2D', 'Path2D', 'DragEvent']) {
  if (!(name in g)) g[name] = class {}
}

// jsdom 的 getContext('2d') 返回 null：换成全 no-op 的假 2d context
const fakeContext2d: unknown = new Proxy(
  {},
  {
    get: (_target, key) => {
      if (key === 'measureText') return () => ({ width: 0 })
      if (key === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) })
      if (key === 'canvas') return { width: 0, height: 0 }
      return () => fakeContext2d
    },
    set: () => true,
  },
)

if (typeof window !== 'undefined') {
  window.HTMLCanvasElement.prototype.getContext = (() => fakeContext2d) as never
}
