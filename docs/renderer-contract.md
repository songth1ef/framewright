# renderer-contract — 渲染器契约（T11 定案）

> **单一真相源。** 两个渲染器与应用层的边界以本文件为准。
> 定案依据：`docs/plans/answers/T10-dom.md` 与 `T10-leafer.md` 两份**独立作答**（互不可见）。
> 定案日期：2026-08-03。实现属 P2，本文件只定契约。

---

## 0. 定案依据摘要

### 0.1 两侧独立收敛的四项（最强证据，全部采纳）

两个实现者在互不可见的情况下指出了同一批问题。**独立收敛 = 铁证，不需要再论证。**

| # | 问题 | DOM 侧 | Leafer 侧 |
|---|---|---|---|
| 1 | `onNodesMove` 的 x/y 坐标系没钉（相对父节点 vs 画布绝对） | Q6-1、风险 1/3 | Q6-2、风险 2 |
| 2 | 缺 `onNodesResize` 与 `onNodesDelete` | 风险 2 | Q7-1、Q7-2 |
| 3 | `onViewportChange` 未定义触发频率 | Q6-2 | Q6-1 |
| 4 | 「空白」的判定语义未定，直接决定框选能否触发 | 风险 2（root frame 覆盖全画布） | 风险 3（透明 frame 内部算不算空白） |

第 4 项尤其值得注意：**两侧从完全不同的技术路径撞上了同一个语义空洞**——DOM 侧是「`closest()` 永远能命中 root」，Leafer 侧是「无 fill 的 Box 命中语义不明」。同一个坑，两种长相。

⚠️ **第 1 项还附带一个更要紧的发现（Leafer 侧提出）**：demo 文档的子节点恰好全在 root 直下，此时**父相对坐标 == 画布绝对坐标**，所以**现有的 parity 测试根本测不出这个分歧**。P0 的绿灯在这一项上是假绿。

### 0.2 只有一侧能发现的三项（「换模型写第二个实现」的价值兑现）

| # | 发现 | 来自 | 为什么另一侧发现不了 |
|---|---|---|---|
| 5 | **Leafer 内建手势直接改 transform = 状态泄漏** | Leafer | DOM 没有「内建手势」这种东西 |
| 6 | 场景图打平的连带税（clip 空转、拖 frame 要自维护后代映射） | Leafer | DOM 天然嵌套，不存在此问题 |
| 7 | 复合业务单元的内部按钮会冒泡，需 `onNodeAction` + opt-out | DOM | Leafer 侧内部元素自绘，冒泡形态不同 |

**这三条中没有一条是两侧都能看到的。** 如果两个渲染器由同一个模型写，它们大概率会同时缺席。

### 0.3 我的裁决（两侧报上来但明确不猜的歧义）

| # | 歧义 | 裁决 | 理由 |
|---|---|---|---|
| 8 | 点击 `locked` 节点 = 点空白还是无反应 | **等同点空白**（清空选中） | `locked` 语义是「不可操作」，点它就该像点了它下面的画布。规则最少 |
| 9 | 带 `rotation` 的节点，框选与四角缩放怎么算 | **首版一律按未旋转包围盒（AABB）** | 规格本就没有旋转控制点，`rotation` 暂无 UI 可改。精确多边形留到真有需求时 |
| 10 | `onSelectionChange` 的 `fwIds` 是被切换的那个还是切换后全集 | **改名 `onSelectionRequest`；`fwIds` = 本次操作涉及的最小集合**，最终集由 host 调 `core.applySelection` 算 | 选中集本来就是 host 的状态，渲染器只该上报意图 |
| 11 | 透明 frame（`background: null`）的内部算不算空白 | **算空白**，只有边框区域算命中 frame | 否则用户在画框内部起拖永远框选不了 |

---

## 1. RenderContext（渲染器的全部输入）

```ts
export interface Viewport {
  scale: number
  offsetX: number
  offsetY: number
}

export interface RenderContext {
  root: FrameNode
  selection: readonly string[]
  viewport: Viewport
  callbacks: RendererCallbacks
}
```

**没有新增字段。** 两侧独立确认：拖拽预览、选框、hover 高亮、控制点、包围框**全部是渲染器内部的纯呈现**，不需要进 `RenderContext`。

> Leafer 侧的原话值得留档：*「把『拖拽中的临时位移』放进 ctx 反而会把它变成需要持久化/同步的状态，违背规格『过程不进状态』的本意。」*

## 2. RendererCallbacks（最终签名）

```ts
export type SelectionMode = 'replace' | 'toggle' | 'add'
export type Corner = 'nw' | 'ne' | 'sw' | 'se'

export interface RendererCallbacks {
  /**
   * 用户请求改变选中集。
   * fwIds = 本次操作涉及的**最小集合**（点选 = 那一个；框选 = 框中的全部；清空 = []）。
   * 最终选中集由 host 调 core.applySelection(current, fwIds, mode) 计算。
   * fwIds 恒为业务单元，不含内部元素。
   */
  onSelectionRequest(fwIds: readonly string[], mode: SelectionMode): void

  /**
   * 用户移动了节点。**拖拽结束时触发一次，不逐帧。**
   * 🔴 x/y 是**相对父节点**的坐标（与 node schema 和撤销日志的存储坐标一致），
   *    不是画布绝对坐标。换算由 core.computeMoves 负责。
   */
  onNodesMove(
    moves: ReadonlyArray<{ fwId: string; parentFwId: string; x: number; y: number }>,
  ): void

  /**
   * 用户等比缩放了节点。**拖拽结束时触发一次，不逐帧。**
   * 必须带 x/y：从非右下角的控制点拖拽时，位置也会变。
   * x/y 语义同 onNodesMove（相对父节点）。
   */
  onNodesResize(
    resizes: ReadonlyArray<{
      fwId: string
      parentFwId: string
      x: number
      y: number
      width: number
      height: number
    }>,
  ): void

  /** 用户删除了节点（Delete / Backspace）。 */
  onNodesDelete(fwIds: readonly string[]): void

  /**
   * 用户改变了视口（平移或缩放）。
   * 🔴 **逐帧触发**（与 onNodesMove 的「结束才触发」相反）——平移缩放要求 1:1 跟手，
   *    且滚轮缩放没有可靠的结束事件。
   */
  onViewportChange(viewport: Viewport): void

  /** 用户双击了业务单元。host 决定打开什么。 */
  onNodeActivate(fwId: string): void

  /**
   * 用户点击了业务单元内部的动作按钮（重试 / 重生成 / 下载 / 剪辑 …）。
   * 与 onNodeActivate 分开：那是「打开」，这是「执行一个业务动作」。
   */
  onNodeAction(fwId: string, action: string): void
}
```

### 2.1 触发频率（两侧独立指出的第 3 项，钉死）

| 回调 | 频率 |
|---|---|
| `onViewportChange` | **逐帧**（每 animation frame 最多一次，手势结束时必须保证发出最终值） |
| `onNodesMove` / `onNodesResize` | **手势结束时一次** |
| 其余 | 事件发生时一次 |

**🔴 回流幂等（Leafer 侧提出，DOM 侧未提，同样必须遵守）**：
渲染器用 `ctx.viewport` 设置自身 transform。当 host 把渲染器**自己刚上报的** viewport 回灌进来时，渲染器**必须做相等性短路、不重复应用**，否则会抖动或形成回环。

## 3. 🔴 红线：渲染器不许自己改状态

这条是最核心铁律（`AGENTS.md` §4）在交互上的具体化。**Leafer 侧报的第 1 号风险就是它的实际形态。**

> LeaferJS 自带一整套内建手势，它们**直接修改 transform / 节点位置**——
> `move.holdMiddleKey`、`move.holdSpaceKey`、`wheel.zoomMode`、`zoom.min/max`、
> UI 级 `draggable`，以及 interaction 层内部已监听的 `onWheel`。

**P2 建实例时必须逐项显式 `disabled`，只把 Leafer 的事件层当「感知器」用。**

**漏禁一个，就出现「画布自己动了，但 host 不知道」** —— 视口状态泄漏进渲染器内部，切换渲染器时当场丢失，且 parity 与切换测试都测不出来（因为两侧行为一致地错）。

连带：Leafer interaction 内部已监听 wheel，我们再挂原生 wheel 前**必须先 `wheel.disabled = true`**，否则同一次滚轮被消费两次。

**验收方式**：P2 的切换测试必须新增一条——用中键/滚轮/空格拖动画布后立刻切换渲染器，断言 viewport 与切换前一致。

## 4. 手势状态机（两侧独立确认，写进契约）

**同一个 pointerdown 必须按起点三分支**，不能用浏览器/Leafer 的合成 click 事件：

```
pointerdown (主键)
├── 起点在空白（root frame / 透明 frame 内部 / locked 节点）→ 框选
├── 起点在已选中的业务单元                                  → 拖拽移动
└── 起点在未选中的业务单元                                  → 先选中，再拖拽
```

**为什么不能用 click**：规格要求「起点落在未选节点 → **先选中它，再拖拽**」。选中必须在 `down` 时发生；等到 `click`（= down + up 的合成）才选中，拖动的就是旧选中集。**两侧独立得出同一结论。**

拖拽阈值：移动超过 **4 CSS px** 才从 pending 转为 dragging，否则 `up` 时按点击处理。

## 5. core 需新增的纯函数（两侧需求合并）

全部是纯数学 / 纯几何，**两个渲染器共享同一份**——这是杜绝「同一手势两侧行为分歧」的根本手段。

### `core/src/viewport.ts`

```ts
screenToCanvas(viewport: Viewport, screenPoint: Point): Point
canvasToScreen(viewport: Viewport, canvasPoint: Point): Point
panBy(viewport: Viewport, deltaScreenX: number, deltaScreenY: number): Viewport
zoomAtPoint(viewport: Viewport, anchorScreen: Point, factor: number,
            limits: { min: number; max: number }): Viewport
clampScale(scale: number, min: number, max: number): number
/** 把 wheel 的 deltaY/deltaMode 归一化成「格数」。见下方说明。 */
normalizeWheelSteps(deltaY: number, deltaMode: number): number
/** 全部节点的包围盒，供 Shift+1 适应内容用。 */
getContentBounds(root: FrameNode): Rect
```

**`normalizeWheelSteps` 为什么必须在 core**（Leafer 侧提出）：鼠标 `Ctrl`+滚轮是一格一格的大 delta（≈100），触控板捏合被合成的 `ctrl+wheel` 是小额连续 delta。归一化常数若不统一，**鼠标与触控板的缩放速度手感会不一致**，而且这种不一致 **parity 测试测不出来**（几何对，体感不对）。

### `core/src/hit-test.ts`

```ts
rectFromPoints(a: Point, b: Point): Rect        // 容忍负宽负高
intersects(a: Rect, b: Rect): boolean
/** 框选：与 rect 相交（非完全包含）的全部可选业务单元，已排除 locked 与 root。 */
collectNodesInRect(root: FrameNode, rect: Rect): readonly string[]
/** 点命中：返回最上层可选业务单元，空白返回 null。 */
hitTestPoint(root: FrameNode, canvasPoint: Point): string | null
```

### `core/src/selection.ts`

```ts
applySelection(
  current: readonly string[],
  requested: readonly string[],
  mode: SelectionMode,
): readonly string[]
```

**两侧都要求它**（DOM 侧 D-Q3、Leafer 侧 Q6-5）：避免两侧对 `toggle` / `add` 的去重与顺序理解不同。

### `core/src/transform.ts`

```ts
/** 由选中集 + 画布 delta 算出提交参数。
 *  职责：① 父子同选时只保留最上层（防后代被移动两次）
 *        ② 排除 locked
 *        ③ 画布 delta → 各节点的父相对坐标 */
computeMoves(root: FrameNode, selection: readonly string[], deltaCanvas: Point):
  ReadonlyArray<{ fwId: string; parentFwId: string; x: number; y: number }>

/** 等比缩放：固定对角，按角点位置算新 rect，等比约束 + 最小尺寸钳制。 */
resizeProportional(orig: Rect, corner: Corner, pointerCanvas: Point,
                   opts: { minSize: number }): Rect
```

## 6. 遗留待实测（P2 开工时验，不猜）

Leafer 侧诚实标注了「d.ts 看不出运行时语义」的项，一并留档：

| # | 待验 | 影响 | 退路 |
|---|---|---|---|
| 1 | `scaleFixed` 对 `strokeWidth` 是否生效 | 决定描边恒 2px 是声明式还是手写 `1/scale` | 手动 `strokeWidth = 2 / viewport.scale` |
| 2 | Leafer 是否代为 `preventDefault` 中键 autoscroll | Windows 上中键会出滚动圆圈 | 原生 `pointerdown` 上自己 `preventDefault` |
| 3 | Leafer 内建手势各项的**默认值** | 漏禁一个就状态泄漏 | P2 建实例时逐项打印确认，不依赖记忆 |
| 4 | Leafer 是否上抛 `pointercancel`（事件列表里没有 CANCEL） | 手势中断后光标/状态复位 | `window` 上挂原生 `pointercancel`/`pointerup`/`blur` 兜底 |
| 5 | Leafer key 事件挂在 window 还是 canvas | 焦点在输入框时按 Delete 会不会误删节点 | 原生 `window` keydown + 检查 `document.activeElement` |

**第 5 项是事故级的**：漏了就是「用户在 prompt 输入框里按退格，把画布上的图删了」。

## 7. 一个必须在 P2 前重评的架构问题

**P0 的 Leafer 实现把场景图打平了**——所有节点以画布绝对坐标 `add` 到 leafer 根，**frame 的容器性未被使用**（T6 的「接口摩擦」第 1 条）。

Leafer 侧在 E-Q4 指出这笔税在交互上兑现：

- frame 的 `clip` 空转（子节点不在它下面，裁剪不到）
- 拖拽一个 frame 时，渲染器必须自己维护「fwId → 全部后代 fwId」的映射，整组一起改位置
- DOM 侧因为天然嵌套，完全没有这两个问题

**这不是做不到，是 flat 方案在每个交互上都要补的税。** P2 开工前应重新评估「打平 vs 嵌套」——并且**无论选哪个，这笔账都要如实记进 `docs/architecture.md` §8.2 实现成本对照表**，它正是选型结论的原始素材。
