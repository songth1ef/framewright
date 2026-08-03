# T10 交互可行性问询 — Leafer 侧作答

> 作答人：renderer-leafer 实现者（Kimi）。未阅读 DOM 侧答案。
>
> **证据基准**：文中所有 LeaferJS API 断言均对照本仓已安装的 `leafer-ui@2.2.9` 类型定义
> （`node_modules/.pnpm/@leafer-ui+event@2.2.9/.../index.d.ts`、
> `@leafer+interface@2.2.9/.../index.d.ts`、`@leafer-ui+display@2.2.9/.../index.d.ts`）
> 逐条核实过，标【已核实】。d.ts 看不出的运行时语义标【不确定，P2 实测】，不猜。
>
> **一个贯穿全篇的架构事实**：P0 的 Leafer 实现把场景图打平了——所有节点以画布绝对坐标
> add 到 leafer 根，frame 的容器性未被使用（T6 回报「接口摩擦」第 1 条）。
> 下面 C / E 两项的成本都与此有关。

---

## 交互 A 平移画布（含四种触发：中键 / 空格+左键 / 触控板双指 / Shift+滚轮）

**Q1 监听方式**

- **中键拖拽**：`leafer.on(PointerEvent.DOWN / MOVE / UP, handler)`，事件对象上有
  `middle` 布尔 getter（`UIEvent.middle`【已核实】），也可用 `PointerButton.middle(e)`【已核实】。
- **空格+左键**：Leafer 有全局键盘辅助对象 `Keyboard.isHoldSpaceKey()`【已核实】，
  以及 `KeyEvent`（DOWN/UP/HOLD，`code` 覆盖完整【已核实】）——但 KeyEvent 需要
  interaction 配置 `keyEvent: true` 才启用（`IInteractionConfig.keyEvent`【已核实】）。
  配合 `event.left`【已核实】判定左键拖拽。
- **触控板双指滑动 与 Shift+滚轮**：⚠️ **Leafer 不对外暴露 wheel 事件**。
  `PointerEvent` 的静态事件名列表（POINTER/DOWN/MOVE/UP/OVER/OUT/ENTER/LEAVE/TAP/
  DOUBLE_TAP/CLICK/DOUBLE_CLICK/LONG_PRESS/LONG_TAP/MENU/MENU_TAP）里**没有 WHEEL**【已核实】；
  wheel 被 interaction 层内部消费（`interaction-web` 的 `onWheel`【已核实】），
  对外的通道只有 `IWheelConfig`（zoomMode/moveSpeed/getScale/getMove/preventDefault【已核实】）。
  所以这两种触发只能走 **container 上的原生 `wheel` 监听**（`passive: false`），
  同时必须把 Leafer 内建的 `wheel.zoomMode` 等关掉，否则双重消费（见 Q8）。

**Q2 原始数据**

- Leafer pointer 事件：`x/y`、`getPagePoint()`、`getInnerPoint()`、`getLocalPoint()`
  系列换算方法【已核实】；屏幕 client 坐标 → 画布世界坐标用
  `leafer.getWorldPointByClient(clientPoint)`（`Leafer` 类方法【已核实】），
  反向是 `getClientPointByWorld`【已核实】。世界坐标已含 viewport transform
  （我们把 scale/x/y 设在 leafer 根上），即 = 画布逻辑坐标。
- 原生 wheel：`deltaX/deltaY/deltaMode/clientX/clientY/shiftKey/ctrlKey`。
  平移只需 delta（屏幕像素），除以 viewport.scale 即画布位移。

**Q3 缺什么**

希望 `core` 提供：

```ts
/** 屏幕像素 delta → 新视口。平移数学两侧共用一份。 */
panBy(viewport: Viewport, deltaScreenX: number, deltaScreenY: number): Viewport
```

**Q4 坑与做不到**

1. **Leafer 内建平移是状态泄漏源**：interaction 的 `move.holdMiddleKey` / `move.holdSpaceKey`
   【已核实存在】能直接平移视图——但它是直接改 leafer 根的 transform，视口状态就泄进了
   渲染器内部，host 不知道画布动了。违反「状态不许渗进渲染器」铁律。
   **必须显式 disabled，手势全部自建。** 内建配置的默认值我没有逐项查全，
   P2 建实例时要逐个钉死【半不确定：默认值清单需实测打印】。
2. **触控板双指（规格=平移）与鼠标纯滚轮（规格=缩放）都是无修饰键的 wheel**，
   事件层无法区分，只剩启发式（deltaMode、delta 绝对值分布、deltaX≠0）。
   这是全行业没有完美解的问题，且**启发式必须放 core 两侧共用同一份**，
   否则同一手势 DOM 判平移、Leafer 判缩放——这正是 P0 设计要抓的分歧。
3. 中键在 Windows 浏览器会触发自动滚动（autoscroll 圆圈光标），需要原生
   `pointerdown` 上 `preventDefault`。Leafer 是否已代为 preventDefault【不确定，P2 实测】。

**Q5 中间态反馈**

平移无中间态（跟手即状态本身）。**不需要**往 `RenderContext` 加字段。
但注意：跟手要求 `onViewportChange` 逐帧触发，与 `onNodesMove` 的「松手一次」
语义相反——草案没写这个区别，见 Q6。

---

## 交互 B 缩放画布（滚轮锚点缩放 / Ctrl+= / Ctrl+- / Shift+1 / Ctrl+0 / 触控板捏合）

**Q1 监听方式**

- 滚轮：原生 `wheel` 监听（理由同 A-Q1，Leafer 不暴露 wheel 事件）。
- 触控板捏合：Leafer 有 `ZoomEvent`（`scale` / `totalScale`【已核实】），
  由 multiTouch 手势识别产出；也可按 Chrome 惯例以 `ctrlKey + wheel` 接收捏合【后者是
  浏览器行为，不是 Leafer 特性】。
- `Ctrl+=` / `Ctrl+-` / `Shift+1` / `Ctrl+0`：`KeyEvent`（需 `keyEvent: true`）
  或原生 `keydown`。`IKeyCodes` 覆盖 `Equal`/`Minus`/`Digit0`/`Digit1`【已核实】。

**Q2 原始数据**

wheel 给 `deltaY` 与光标 client 坐标；`ZoomEvent` 给相对比例 `scale`。
锚点 = 光标的画布坐标，经 `getWorldPointByClient` 换算【已核实】。

**Q3 缺什么**

锚点缩放的公式是规格钦定的硬性规则（光标下的画布点必须不动），**全项目只能有一份**：

```ts
/** 以 anchorScreen（屏幕坐标）为锚，按 factor 缩放，结果钳制在 [0.1, 4]。 */
zoomAtPoint(
  viewport: Viewport,
  anchorCanvas: Point,          // 或传 screen + 当前 viewport 内部换算，T11 定
  factor: number,
  limits: { min: number; max: number },
): Viewport

/** Shift+1 适应内容：全部节点包围盒 + 5% 边距 → 新视口。 */
getContentBounds(root: FrameNode): Rect   // walkTree + union，纯几何，必须在 core

/** Ctrl+± 以视口中心为锚步进一档，复用 zoomAtPoint 即可，不另要。 */
```

**Q4 坑与做不到**

1. **Leafer 内建 `wheel.zoomMode` / `zoom.min/max`【已核实存在】同样是直接改 transform**，
   与 A-Q4① 同一个坑：必须 disabled，否则与 `ctx.viewport` 双写。
2. **×1.1 步进 vs 触控板连续 delta**：鼠标滚轮一格的 deltaY ≈ 100（像素模式），
   触控板捏合/双指的 wheel delta 是小额连续值。规格说「每格滚轮 ×1.1」——
   把连续 delta 归一化成「格数」的换算常数如果不放 core 共用，
   两侧缩放手感会不一致（一侧快一侧慢），而且测 parity 测不出来（几何对、体感不对）。
3. `preventDefault` 阻止页面滚动：原生监听 `passive: false` 可控，无坑。

**Q5 中间态反馈**

缩放无中间态。不需要加 `RenderContext` 字段。
（`Shift+1`/`Ctrl+0` 若要动画过渡，动画句柄属渲染器内部呈现细节，也不进 ctx。）

---

## 交互 C 框选

**Q1 监听方式**

`leafer.on(PointerEvent.DOWN)`，命中判定靠事件对象：`target`（实际命中节点）与
`current`【已核实】。场景图打平后，`target === leafer 根` 即「起点在空白」→
进入框选手势，后续 `PointerEvent.MOVE/UP` 推进。

**Q2 原始数据**

起点与当前点的画布坐标（`getWorldPointByClient`【已核实】），
`shiftKey`（`UIEvent.shiftKey`【已核实】）区分「替换」与「增选」。

**Q3 缺什么**

```ts
/** 两个角点归一化成 Rect（容忍负宽负高）。 */
rectFromPoints(a: Point, b: Point): Rect
/** 相交判定（规格钦定「相交即选中」，不是完全包含）。 */
intersects(a: Rect, b: Rect): boolean
/** 框选收集：返回与 rect 相交的全部可选节点 fwId，排除 locked（规格 §2）。 */
collectNodesInRect(root: FrameNode, rect: Rect): string[]
```

节点绝对矩形 core 已有 `walkTree` 可算，上面三个都是纯几何，放 core 两侧共用。

**Q4 坑与做不到**

1. **透明 frame 的命中语义是本项最大坑**：frame 的 `background: null` 时我们建的是
   无 fill 的 `Box`。Leafer 的命中默认按填充区域——透明 frame 的内部区域算
   「命中 frame」还是「命中空白」？如果算命中 frame，用户在透明画框内部起拖
   **永远触发不了框选**（起点判定成「落在未选节点上」）。Leafer 有节点级
   `hittable` / `hitFill`（`'path'|'pixel'|'all'|'none'`）【已核实】可以调，
   但「frame 内部算空白」这个语义长什么样（hitFill:'none'？只命中边框？）
   需要 P2 实测后由 T11 钉进契约——**这是两侧语义最容易分叉的点之一**。
2. 锁定节点：Leafer 命中照样命中 `locked` 节点，是否可选要我们查 node 数据后过滤
   （`collectNodesInRect` 在 core 过滤掉 locked，见 Q3）。

**Q5 中间态反馈**

选框 = 一个临时 `Rect`（半透明 fill + 1px stroke），DOWN 后 add 到根、UP 时 remove，
纯渲染器内部对象，不进 node 树。**不需要**加 `RenderContext` 字段。
描边宽度的 1/scale 补偿见「补 I」。

---

## 交互 D 点选

**Q1 监听方式**

`PointerEvent.DOWN`（⚠️ 不是 `CLICK`，原因见 Q4①）+ `event.shiftKey` 判定 toggle。
命中节点 → fwId 的通道：Leafer UI 有 `data?: IObject` 自由数据字段【已核实】，
P2 建图时写 `data: { fwId }`（这是显式单字段映射，不违反禁展开铁律）。

**Q2 原始数据**

`target`（→ fwId）、`shiftKey`。坐标不需要。

**Q3 缺什么**

无。语义参数（fwId 列表 + mode）直接拿得到。

**Q4 坑与做不到**

1. **不能用 CLICK 事件做点选**。规格 §2 硬性规则：起点落在未选节点 →
   **先选中它，再拖拽**。即 DOWN 时选中就要发生，否则拖动的是旧选中集。
   Leafer 的 `CLICK` 是 down+up 的合成事件，等 CLICK 再选中就把「先选中再拖」做错了。
   推论：点选/拖拽/框选共享一个 DOWN 入口，必须自建手势状态机按起点三分支
   （空白→框选 / 已选→拖拽 / 未选→选中+拖拽），不能靠 Leafer 的合成事件。
2. **locked 节点的点选语义是规格歧义**：规格说 locked「不参与点选与框选，但仍渲染」。
   那么左键点在 locked 节点上 = 点空白（清空选中）？还是无反应？两种都讲得通，
   报给 T11 裁决，我不猜。
3. z 序：场景图打平后 add 顺序即 z 序，Leafer 命中自动取最上层，行为正确。

**Q5 中间态反馈**

hover 高亮（1px 淡描边）：`PointerEvent.OVER/OUT`【已核实】切换节点 stroke，
纯渲染器内部。不需要加 `RenderContext` 字段。

---

## 交互 E 拖拽移动

**Q1 监听方式**

`PointerEvent.DOWN`（命中已选节点，由 D 的手势状态机分支进来）→ `MOVE` → `UP`。
**不用 Leafer 内建 `draggable`**【已核实存在】：它直接改节点 x/y 且只拖单个元素，
「多选整体移动」和「松手才提交」都要自己控。`DragEvent`（START/DRAG/END，
带 `moveX/moveY/totalX/totalY`【已核实】）可参考，但同样直接改节点位置，倾向不用。

**Q2 原始数据**

`PointerEvent.MOVE` 的画布坐标自算 delta，或 `DragEvent.totalX/totalY`（画布系，
已含 scale【已核实是 world 系增量】）。

**Q3 缺什么**

```ts
/** 由选中集 + 画布 delta 算出提交参数。
 *  职责：① 父子同选时只保留最上层（防双重移动）
 *        ② 把画布 delta 换算成各节点「相对父坐标」的新 x/y（schema 存储坐标） */
computeMoves(root: FrameNode, selection: readonly string[], deltaCanvas: Point):
  ReadonlyArray<{ fwId: string; x: number; y: number }>
```

**Q4 坑与做不到**

1. **场景图打平的连带成本在这里兑现**：预览移动一个 frame 时，它的后代是
   独立 add 在 leafer 根上的（不是 frame 的子节点），所以渲染器内部必须维护
   「fwId → 全部后代 fwId」的映射，预览时整组一起改 x/y。DOM 嵌套结构天然没有
   这个问题。这不是做不到，是 flat 方案在每个交互上都要补的税——连同 T6 报过的
   clip 空转，**P2 前值得重新评估一次「打平 vs 嵌套」**。
2. 预览的画法：直接改选中（及后代）Leafer 节点的 x/y，松手后提交
   `onNodesMove`，host 回流新 ctx 重画纠正。预览期不改 node 树，符合规格
   「拖拽过程是纯呈现」。
3. 多选拖任意一个整体动：预览时对选中集所有节点（+各自后代）套同一 delta，可做。

**Q5 中间态反馈**

拖拽预览 = 临时改 Leafer 节点几何（纯呈现）。**不需要**加 `RenderContext` 字段——
把「拖拽中的临时位移」放进 ctx 反而会把它变成需要持久化/同步的状态，违背规格
「过程不进状态」的本意。

---

## 交互 F 激活（双击）

**Q1 监听方式**

`PointerEvent.DOUBLE_CLICK`【已核实存在】，命中节点 → fwId（同 D 的 `data` 通道）。

**Q2 原始数据**

`target` → fwId。坐标不需要。

**Q3 缺什么**

无。

**Q4 坑与做不到**

无明显坑。双击前会先发两次 DOWN——按 D 的方案 DOWN 即选中，双击的净效果是
「选中 + 激活」，符合预期，不与点选打架。

**Q5 中间态反馈**

无。

---

## 交互 G 等比缩放（四角控制点）

**Q1 监听方式**

四个角控制点 = 渲染器内部的 overlay `Rect` 节点（不进 node 树），各自挂
`PointerEvent.DOWN/MOVE/UP`；hover 光标经节点级 `cursor` 属性
（`ui.cursor = 'nwse-resize'` 等【已核实】）。

**Q2 原始数据**

拖拽中的画布坐标（`getWorldPointByClient`）、起始 rect（由 ctx.selection +
节点几何算出）。

**Q3 缺什么**

```ts
/** 等比缩放：固定对角，按角点位置算新 rect，等比约束 + 最小尺寸钳制。
 *  角点→新 rect 的几何全项目只能一份。 */
resizeProportional(orig: Rect, corner: 'nw'|'ne'|'sw'|'se', pointerCanvas: Point,
  opts: { minSize: number }): Rect
```

**Q4 坑与做不到**

1. **命中区域扩大有现成解**：Leafer 有全局 `pointer.hitRadius`（interaction 配置）
   和节点级 `hitRadius`【均已核实】，控制点命中热区可直接调大，不用画隐形大热区。
2. 多选时控制点只出现在「整个选中集的包围框」上（规格 §5）——包围框也是 overlay，
   由渲染器根据 selection 自己算自己画，不需要 ctx 帮忙。
3. **旋转节点的四角缩放**：node 有 `rotation` 字段，规格没做旋转控制点，
   但「一个转了 30° 的节点，四角拖拽的等比缩放怎么算」几何上是另一套题
   （要变到节点局部坐标系）。P2 首版建议声明「旋转节点的缩放按其未旋转包围盒处理」
   或「旋转节点暂不给控制点」——这是规格缺口，报 T11 裁决【我不猜】。

**Q5 中间态反馈**

控制点 / 包围框 / 缩放中的尺寸预览 = overlay 节点，纯渲染器内部。
**不需要**加 `RenderContext` 字段。
但缩放的**提交**回调草案里没有——见 Q6 / Q7，这是契约缺口，不是呈现问题。

---

## 补 H 键盘操作

**Q1 监听方式**

两条路：① Leafer `KeyEvent`（DOWN/UP/HOLD，`code` 覆盖 `Delete`/`Backspace`/
`ArrowUp` 等全量【已核实】），需 `keyEvent: true`；② 原生 `window` keydown。
**焦点问题是决定因素**：canvas 没有 DOM focus 概念，Leafer 的 key 事件监听挂在
window 还是 canvas 元素上，d.ts 看不出来【不确定，P2 实测】。保守方案是原生
`window` keydown + 检查 `document.activeElement` 不是 input/textarea/contenteditable。

**Q2 原始数据**

`code` / `key` / `shiftKey` / `ctrlKey`【已核实】。

**Q3 缺什么**

不需要 core 新函数。全选 = `collectNodeIds`（已有）过滤 locked；
方向键 1px / Shift+10px 的 delta 是常量，提交走同一个 `onNodesMove`。

**Q4 坑与做不到**

1. **Delete/Backspace 的回调草案里没有**——见 Q7，契约缺口。
2. `Ctrl+A` 会触发浏览器全选页面文本，要 `preventDefault`。
3. 焦点跑到页面输入框时，方向键/Delete 绝不能删画布节点——activeElement
   检查是硬要求，漏了就是「用户在 prompt 输入框里按退格把图删了」的事故。

**Q5 中间态反馈**

无。

---

## 补 I 不随缩放变化的视觉元素

**有声明式解，大概率不用手写 1/scale**：Leafer UI 有
`scaleFixed?: boolean | 'zoom-in' | number`【已核实】，语义即「元素不随视图缩放」。
选中描边、控制点、包围框、选框全部设 `scaleFixed: true` 即可。

存疑与退路：

1. `scaleFixed` 对 **strokeWidth** 是否同样生效（描边恒 2px 视觉宽度）——
   d.ts 看不出渲染语义【不确定，P2 实测】。若不生效，退路是手动
   `strokeWidth = 2 / viewport.scale`（viewport 是 ctx 输入，可得）。
2. `scaleFixed` 的世界坐标/命中行为是否照常【不确定，P2 实测】——overlay 不进
   `getRenderedBounds`，对 parity 无影响。
3. 0.5px 瑕疵：补偿后描边落在非整数物理像素会模糊，Leafer 内部是否做像素对齐
   【不确定】。真出现再处理，属可接受瑕疵级别。
4. 「更省事的做法」——overlay 放在不受 transform 影响的层：Leafer 有 `zoomLayer`
   概念（`Leafer.zoomLayer`【已核实】），也可再叠一个无 transform 的 Leafer 实例。
   但 `scaleFixed` 若实测可用，比这两条路都省。**优先验证 scaleFixed。**

---

## 补 J 光标反馈

机制（按可靠性排序）：

1. **hover 类光标**（业务单元 `move`、控制点 `nwse-resize`）：节点级 `ui.cursor`
   【已核实】，Leafer 命中悬停自动切换。
2. **手势类光标**（`grab`/`grabbing`/`crosshair`）：interaction 有 `setCursor`
   【已核实】；更直接的兜底是 canvas 就是单个 DOM 元素，`canvas.style.cursor`
   是同步、无命中判定的，手势状态机自己设最可靠。
3. **手势中断复位**：⚠️ `PointerEvent` 静态事件列表里**没有 CANCEL**【已核实】——
   Leafer 如何把 `pointercancel` 上抛（还是吞掉）【不确定】。保守做法：
   手势状态机在 `window` 上挂原生 `pointercancel` / `pointerup` / `blur`
   统一复位光标与手势，`destroy()` 时一并摘除。

---

## Q6 契约缺陷

1. **`onViewportChange` 的触发频率没写**。平移/缩放是连续手势，规格要求 1:1 跟手，
   必须逐帧触发——与 `onNodesMove` 的「松手一次」语义相反，草案把两者并列却没区分。
   连带问题：渲染器 → host → ctx → 渲染器的回流必须幂等。渲染器用 ctx.viewport
   设 transform，如果回流的是渲染器自己刚上报的值，必须相等性短路，
   否则会抖动/回环。建议契约写明：「onViewportChange 逐帧触发；渲染器对
   与自身当前值相等的 viewport 回流不重复应用」。
2. **`onNodesMove` 的 x/y 坐标系没钉**：schema 存储坐标（相对父节点）还是
   画布绝对坐标？我建议 = **相对父节点的存储坐标**——那是要写回树和撤销日志的值，
   绝对→相对的换算放 core（`computeMoves`，见 E-Q3）。不钉死的话两侧各按一种
   理解实现，又是在 DEFAULT_VIEWPORT + 根层节点下测不出来的那类分歧
   （demo 文档的子节点都在 root 直下，父坐标 = 绝对坐标，恰好掩盖）。
3. **缺 resize 回调**：G（四角等比缩放）在交互清单里，草案没有对应提交回调。见 Q7。
4. **缺 delete 回调**：Delete/Backspace 在规格 §3 里，草案没有。见 Q7。
5. **`onSelectionChange` 的 fwIds 语义没钉**：'toggle' 时传的是被切换的那一个，
   还是切换后的全集？我建议 fwIds 恒为「本次操作涉及的最小集合」、mode 描述
   并入方式、最终选中集由 host 算（状态本来就在 host）——但这涉及草案形状，
   报 T11 裁，不自作主张。

## Q7 多出来的需求

1. **`onNodesResize(resizes: ReadonlyArray<{ fwId, x, y, width, height }>): void`** ——
   等比缩放的提交（同「松手一次」语义）。必须带 x/y：从非右下角拖时位置也会变。
2. **`onNodesDelete(fwIds: readonly string[]): void`** —— Delete/Backspace。
3. **明确不需要 `onHoverChange`**：hover 描边是纯呈现，规格 §5 的 hover 反馈
   渲染器自己画得出来，上抛只会污染状态层。写出来防 T11 把它加进去。
4. **明确不需要撤销/重做回调**：Ctrl+Z / Ctrl+Shift+Z 是应用层快捷键，
   与渲染无关，不该经过渲染器。

## Q8 事件冲突

1. **Leafer 内建手势 vs 自建手势状态机（本侧最大集成风险）**：interaction 的
   `move.holdMiddleKey/holdSpaceKey`、`wheel.zoomMode`、`zoom.min/max`、
   UI 级 `draggable` 全部直接改 transform/节点位置 = 状态泄进渲染器。
   P2 建实例时必须把内建手势**逐项显式 disabled**，只把 Leafer 事件层当感知器。
   漏禁一个就出现「画布自己动了但 host 不知道」。
2. **wheel 双消费**：Leafer interaction 内部已监听 wheel（`onWheel`【已核实】），
   我们再挂原生 wheel 必须先把 `wheel.disabled = true`，否则同一滚轮触发两次。
3. **DOWN 入口的三分支**：同一个 pointerdown 按「空白/已选/未选」分派到
   框选/拖拽/选中+拖拽三个手势（规格 §2 硬性规则），Leafer 的合成事件
   （CLICK/DOUBLE_CLICK）帮不上忙，只能自建状态机 + 移动阈值确认手势。
4. **触控板双指（=平移）vs 纯滚轮（=缩放）**：无修饰键区分，只有 delta 启发式。
   启发式必须放 core 两侧共用，否则同一手势两版行为分歧（见 A-Q4②）。
5. **中键 autoscroll**（Windows）与**空格被页面滚动/按钮激活抢走**：
   都要原生 preventDefault + 焦点检查，Leafer 是否已代做【不确定，P2 实测】。
6. **`pointercancel` 无对应 Leafer 事件**：手势中断兜底走原生 window 监听（见补 J）。
