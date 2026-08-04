import type { IMoveConfig, Leafer } from 'leafer-ui'

/** moveMode 中任一打开都会让 Leafer 的 Dragger 绕过 host 直接平移/缩放视图。 */
const MOVE_MODE_KEYS = ['drag', 'dragEmpty', 'holdSpaceKey', 'holdMiddleKey', 'holdRightKey'] as const

/**
 * 建实例时的显式确认（docs/renderer-contract.md §3.1 实测订正）：
 * plain leafer-ui@2.2.9 下唯一能真正改 transform 的内建手势是 **moveMode** 与
 * **UI 级 draggable**，两者默认皆关。本检查把「moveMode 没被打开」变成挂载时的
 * 机器断言——漏禁一个就是「画布自己动了但 host 不知道」的视口状态泄漏，
 * 且 parity / 切换测试都测不出来（两侧会一致地错）。
 *
 * UI 级 draggable 由我方 shape 工厂保证从不设置（默认值由
 * gesture-defaults.probe.test.ts 钉住）；wheel handler 在 plain Leafer 下对
 * transform 本就是 no-op，zoom.min/max 本版本未被读取，故不在此检查。
 *
 * ⚠️ 失效条件（达成时必须重验，见 §3.1）：引入 leafer-editor / App、升级 leafer-ui、
 * 启用 multiTouch 手势。
 */
export function assertBuiltinGesturesInert(leafer: Leafer): void {
  const move: IMoveConfig = leafer.config.move ?? {}
  const offenders = MOVE_MODE_KEYS.filter((key) => Boolean(move[key]))
  if (offenders.length > 0) {
    throw new Error(
      `Leafer 内建移动手势被打开（config.move: ${offenders.join(', ')}），` +
        '它会绕过 host 直接改 transform，造成视口状态泄漏。' +
        '见 docs/renderer-contract.md §3.1',
    )
  }
}
