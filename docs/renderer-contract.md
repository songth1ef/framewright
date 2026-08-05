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

> ~~⚠️ **第 1 项还附带一个更要紧的发现（Leafer 侧提出）**：demo 文档的子节点恰好全在 root 直下，此时父相对坐标 == 画布绝对坐标，所以现有的 parity 测试根本测不出这个分歧。P0 的绿灯在这一项上是假绿。~~
>
> **❌ 已核实推翻（2026-08-03，读 `packages/core/src/demo-document.ts` 原文）**：
> demo 文档**有**两层嵌套——`nested-box` 挂在 `inner-frame` 下，`inner-frame` 偏移 `(380,60)`，
> 所以 `nested-box` 的父相对坐标 `(20,20)` **≠** 绝对坐标 `(400,80)`。前提不成立。
>
> 顺带澄清：现有 parity 测试断言的是 `getRenderedBounds()`，其语义**已明确定义为画布绝对坐标**，
> 本就没有歧义可言；而 `onNodesMove` 属 P2、尚不存在，**任何 P0 测试都不可能覆盖它**。
> 所以「P0 假绿」这个说法两头都不成立。
>
> **但第 1 项的定案本身仍然成立且必要**——坐标系语义确实必须钉死，否则 P2 两侧各按一种理解实现。
> 结论对，论据错，论据已撤。

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

### 2.2 可见性量具 `getVisibleNodeIds()`

`RendererAdapter.getVisibleNodeIds()` 自报渲染器**实际画出来的节点**。有效可见性统一由
`core.collectVisibleNodeIds()` 定义：节点自身与全部祖先都 `visible` 时才可见。

测试不拿两个渲染器的自报结果互相比，而是让每一侧分别与 core 的独立计算比对。这样能
避开 `getRenderedBounds()` 已存在的盲区：若两侧都用同一套错误的手工累加值自报，互比
仍会变绿。两个渲染器必须从自己的实际 DOM / 场景图行为采集本方法结果，**不得直接转调
`collectVisibleNodeIds()`**，否则断言退化为 core 自己与自己比较。

## 3. 🔴 红线：渲染器不许自己改状态

这条是最核心铁律（`AGENTS.md` §4）在交互上的具体化。**Leafer 侧报的第 1 号风险就是它的实际形态。**

> LeaferJS 自带一整套内建手势，它们**直接修改 transform / 节点位置**——
> `move.holdMiddleKey`、`move.holdSpaceKey`、`wheel.zoomMode`、`zoom.min/max`、
> UI 级 `draggable`，以及 interaction 层内部已监听的 `onWheel`。

**P2 建实例时必须逐项显式 `disabled`，只把 Leafer 的事件层当「感知器」用。**

### 3.1 实测订正（2026-08-04，Kimi 运行时探针 + bundle 源码分析）

上面那条红线是**基于 API 存在性**写的，**开得过宽**。实测 `leafer-ui@2.2.9` 的**运行时默认值**：

```
config.move   = { autoDistance: 2 }        ← 没有 drag / holdSpaceKey / holdMiddleKey
                                              / holdRightKey / dragEmpty，全部 undefined
config.zoom   = {}                          ← 空
config.wheel  = { zoomSpeed:0.5, moveSpeed:0.5, rotateSpeed:0.5, delta:{x:20,y:8} }
Rect.draggable = false
config.keyEvent = true                      ← 默认就开着
```

结合 bundle 源码分析：

| 原红线列的项 | 2.2.9 plain Leafer 的实情 |
|---|---|
| `move.holdMiddleKey` / `holdSpaceKey` | `config.move` **确实被读**（`get m()`），但这几个开关**默认全是 undefined = 关**。开了才会由 Dragger 直接平移视图 |
| UI 级 `draggable` | 被 Dragger 消费，但**默认 `false`** |
| `wheel.zoomMode` | **wheel handler 在 plain Leafer 里对 transform 是 no-op**，只在配置了 `preventDefault` 时起作用 |
| `zoom.min` / `zoom.max` | **本版本根本没被读取**（只与 editor / 未来版本相关） |

**修正后的结论**：在 `leafer-ui@2.2.9` 的 **plain Leafer**（不引 `App`、不引 `leafer-editor`）下，能真正改 transform 的只有 **moveMode** 与 **UI `draggable`** 两项，**且两者默认都是关的**。

**所以 D1-leafer 的实际风险远低于原判断**——不需要「逐项禁用六样东西」，只需要**不去打开**它们，并在建实例时显式确认这两项为关。

⚠️ **这个结论有明确的失效条件，达成时必须重验**：

1. **引入 `leafer-editor` 或 `App`**（D5 选中 overlay 很可能要用）——它们会启用另一套 interaction，`zoom.min/max` 那时才被消费
2. **升级 leafer-ui 版本**
3. 使用 multiTouch 手势（本版本 `zoom()`/`rotate()` 基类是 no-op，但那是实现细节，可能变）

**探针脚本值得保留**：升级 leafer-ui 后重跑一次就知道默认值有没有变，比读 changelog 可靠。

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

---

## 附录 · 视口尺寸归属（2026-08-05 裁定）

### 问题

Leafer 接入视口裁剪后上报：

> `ViewportCullingOptions.width/height` 不在 `RenderContext`，渲染器只能从
> container 的 `getBoundingClientRect()` 读取；单纯容器 resize 且 host 不触发 update 时不会主动重裁。

### 裁定：视口尺寸进 `RenderContext`，由 host 提供

**依据是本项目的铁律：状态不许存在渲染器内部。**

裁剪需要的是「视口有多大」，这是**会话状态**，跟 `viewport.scale/offset` 是同一类东西 ——
而后者早就在 `RenderContext` 里了。把尺寸单独留给渲染器自己去读 DOM，等于把一份状态
劈成两半：一半 host 管，一半渲染器各自管。

**两个渲染器各自读 `getBoundingClientRect()` 还有第二个问题**：它们会在不同时机读到
不同的值，于是「同一份数据两套实现画出来要一样」这条对照前提被悄悄破坏 ——
而这类不一致极难被测试发现，因为两边各自的测试都会绿。

**做法**：`RenderContext` 增加 `viewportSize: { width: number; height: number }`，
host 从容器测量并在 resize 时触发 update。两侧渲染器一律用它，不再自己读 DOM 尺寸。

⚠️ 这是 `RendererAdapter` 契约变更，**两侧必须同时改**，不许一边先行。

---

## 附录 · 交互模式可切换（2026-08-05 裁定）

### 起因

用户观察到「Leafer 的交互不是走 leaferjs 自带的，而是外层 HTML 做的」，
并提出：**既然渲染引擎能切换，交互也该能切「用原生的还是用统一的」，才好对照。**

### 为什么「多写点代码能统一行为」成立

**因为行为语义本来就不在拾取里。** 成本可拆两层，只有下层需要换：

| 层 | 内容 | 可换？ |
|---|---|---|
| **空间查询** | 「这个点落在哪个节点的几何里」 | ✅ `hitTestPoint` ↔ 浏览器 `event.target` / Leafer 场景图拾取 |
| **业务过滤** | 跳过 `root`、跳过 `locked`、透明 `frame` 不算命中、控制点优先… | ❌ **永远共用** |

原生拾取只是换一个更快的空间查询，**答案应当与统一实现完全相同**。

### 🔴 但必须能验证「相同」，否则这个开关有害无益

**dev 模式下两条路都跑一遍，断言返回同一个 `fwId`。**

没有这条断言，换成原生之后「变快了」和「行为变了」会混在一起分不清。
本仓已经吃过两次「两侧一致地错、而测试全绿」的亏：

- 连线被画布底色整个盖住，所有测试都绿（连线不进 `getRenderedBounds()`）
- Leafer 内建手势若被打开会绕过 host 直接改 transform，**parity 与切换测试都测不出来**（两侧会一致地错）

所以 `builtin-gesture-guard.ts` 才把「没被打开」做成挂载时的机器断言。
交互模式开关同理 —— **一致性必须是被证明的，不是被假设的。**

### 设计

- `RenderContext` 增加 `interactionMode: 'unified' | 'native'`（默认 `unified`）
- 两侧渲染器各自实现 `native` 分支：DOM 用 `event.target` 上溯找 `data-fw-id`；
  Leafer 用场景图拾取取 `fwId`
- **业务过滤沿用同一段代码**，只是喂给它的候选 `fwId` 来源不同
- dev 模式下 `native` 分支额外跑一遍 `unified` 并断言一致，不一致时报错并落日志

### 这同时解掉一条既有的对照代价

`architecture.md` 记过：此前两侧都放弃了原生命中测试，
**对照成立但两侧都没跑在自己的天花板上**。有了这个开关，
「用原生能力」不再是作弊 —— 可以分别测出各自的上限，对照也仍然可比。

---

## 附录 · 交互模式的两条裁定（2026-08-05 夜）

执行方在实现 Leafer native 分支时主动上报两条，均已裁定。

### ① `interactionMode` 缺省必须落到 `unified`

**现状**：两侧都写 `interactionMode === 'unified'` 做裁比较，
所以 `undefined` 会落进 **native** 分支 —— 而 `core` 的
`resolveInteractionMode` 注释写的是「未提供时按 `DEFAULT_INTERACTION_MODE`（`unified`）处理」。

**裁定：改成 `resolveInteractionMode(...) === 'unified'`，两侧同一个 commit。**

理由：「host 目前永远显式传值，所以不可达」**不是辩护**。
默认值存在的意义就是**在没人传的时候是对的**；
文档写着 `unified` 而代码走 `native`，是一个等着被踩的陷阱。

⚠️ 两侧必须同一个 commit 改 —— 一边先行就会出现「同一份数据两种拾取」的窗口期。

### ② `locked` 节点对命中测试是穿透的

**行为微变**：删掉 Leafer 侧的探针捷径后，
「点在 locked 节点上、其几何下方有可选节点」时，`unified` 会选中**下方**的节点
（`hitTestPoint` 对 locked 穿透），而旧捷径按**空白**处理。

**裁定：接受新行为。**

依据：`locked` 的语义是「**不能被操作**」，不是「**挡住点击**」。
且这与 DOM 侧 `unified` 的既有行为一致（DOM 从来不 consult `event.target`），
所以这是**向 parity 靠拢，不是偏离**。

⚠️ demo 文档里 locked 节点下方只有 root，故现有测试全绿 ——
**这意味着这条行为没有被测试覆盖**。补一条专门的用例：
locked 节点下方放一个可选节点，断言点击选中下方那个。
