# T10 交互可行性问询：DOM 侧

> 结论：A-F 在 DOM 侧均可实现。建议统一使用 Pointer Events；滚轮单独使用
> `wheel` 原生监听。DOM 侧只把 `clientX/clientY` 归一化成画布容器内的 CSS
> 像素坐标，坐标换算、锚点缩放、框选相交和批量移动计算全部交给 core。

## 交互 A 平移画布

**Q1 监听方式**：

- 在画布容器监听原生 `pointerdown`，仅接受 `event.button === 1`。
- 手势开始后调用 `element.setPointerCapture(event.pointerId)`，继续监听
  `pointermove`、`pointerup`、`pointercancel`、`lostpointercapture`。
- 额外监听 `auxclick` 并 `preventDefault()`，抑制浏览器中键自动滚动。

**Q2 原始数据**：

`PointerEvent` 直接提供 `clientX/clientY`、`pointerId`、`button/buttons`、
`pointerType`。`clientX/clientY` 的原点是浏览器 viewport 左上角，单位是 CSS
像素，不含 framewright 的 viewport 平移与缩放。DOM 侧用
`container.getBoundingClientRect()` 减掉容器左上角，得到**容器局部屏幕坐标**；
delta 用连续两次局部坐标相减，不依赖兼容性更差的 `movementX/movementY`。

**Q3 缺什么**：

希望 core 提供：

```ts
panBy(viewport: Viewport, screenDelta: Point): Viewport
```

这里 `screenDelta` 是 CSS 像素。平移发生在屏幕空间，所以无需除以 scale。
`DOMRect -> 容器局部 Point` 是 DOM 专有归一化，不应进入 core。

**Q4 坑与做不到**：

- 中键默认会触发浏览器自动滚动，必须在 `pointerdown`/`auxclick` 阻止默认行为。
- 指针移出容器、窗口失焦、系统手势抢占都会中断手势，必须处理
  `pointercancel` 和 `lostpointercapture`，不能只等 `pointerup`。
- 中键平移应高于节点命中优先级：即使起点在业务单元上，也必须进入 pan，不能
  误触点选或拖拽。
- `onViewportChange` 的调用频率草案未定义。DOM 侧可以高频给出，但建议最多每个
  animation frame 一次并保证结束时发出最终值，否则 React host 会被滚轮/移动事件
  洪泛。

**Q5 中间态反馈**：

渲染器保存手势起点和最近一次 pointer 坐标；每帧计算新 viewport 并调用
`onViewportChange`。viewport 是切换后必须保留的会话状态，因此最终值必须尽快进入
应用层，不能只存在 renderer。无需给 `RenderContext` 增加手势中间态字段。

## 交互 B 缩放画布

**Q1 监听方式**：

在画布容器上用原生
`container.addEventListener('wheel', handler, { passive: false })`，并在处理时调用
`event.preventDefault()`，避免页面跟着滚动。这里不依赖 React `onWheel` 的委托与
passive 策略。

**Q2 原始数据**：

`WheelEvent` 提供 `clientX/clientY`、`deltaX/deltaY`、`deltaMode`、修饰键。
光标坐标仍是浏览器 viewport CSS 像素，需要减去容器 rect 得到容器局部屏幕坐标。
`deltaY` 不是缩放倍率：其单位可能是 pixel、line 或 page，触控板还会产生大量小
delta；它也不含 framewright 当前 scale。

**Q3 缺什么**：

希望 core 提供：

```ts
screenToCanvas(viewport: Viewport, screenPoint: Point): Point
canvasToScreen(viewport: Viewport, canvasPoint: Point): Point
zoomAtPoint(viewport: Viewport, screenPoint: Point, nextScale: number): Viewport
clampScale(scale: number, min: number, max: number): number
```

DOM 侧负责依据 `deltaMode` 归一化 wheel delta，并把它转成 `nextScale`；core 保证
光标下的 canvas point 缩放前后不动。

**Q4 坑与做不到**：

- 必须钉住最小/最大 scale，否则高频触控板输入会把 scale 推到 0 或极大值。
- `deltaMode` 跨设备不同，不能直接写 `scale -= deltaY / 100`。
- 浏览器的触控板 pinch 常表现为带 `ctrlKey` 的 wheel；产品需决定把它与普通滚轮
  同等视为缩放，DOM 侧技术上可识别。
- 阻止默认 wheel 会让鼠标位于画布时页面不能滚动，这是需求要求的“滚轮缩放”带来
  的必然取舍，应限定监听范围只覆盖画布容器。

**Q5 中间态反馈**：

每个 wheel 批次按 animation frame 合并，计算 viewport 后调用
`onViewportChange`，由应用层回灌 `RenderContext.viewport`。不新增字段。缩放没有
可靠的 pointerup，不能只在“结束时”提交。

## 交互 C 框选

**Q1 监听方式**：

- 监听主键 `pointerdown`（`button === 0`），通过
  `(event.target as Element).closest('[data-fw-id]')` 判断起点是否命中业务单元。
- root frame 覆盖整个画布，必须把 `ctx.root.fwId` 特判为“空白”，否则永远无法
  从画布空白处开始框选。
- 空白起点进入 marquee 状态并 `setPointerCapture`，随后处理
  `pointermove`、`pointerup`、`pointercancel`。

**Q2 原始数据**：

能拿到起点和当前点的 `clientX/clientY`，归一化后是容器局部屏幕坐标。浏览器不会
直接给 canvas rect，也不会替我们判断与业务单元相交。

**Q3 缺什么**：

希望 core 提供：

```ts
screenToCanvas(viewport: Viewport, screenPoint: Point): Point
rectFromPoints(a: Point, b: Point): Rect
hitTestRect(root: FrameNode, canvasRect: Rect): readonly string[]
```

`hitTestRect` 应统一处理：排除 root、`visible:false`、`locked:true`，遵守祖先 frame
的 clip，并明确 rotation 的口径。

**Q4 坑与做不到**：

- 当前 `Rect/getRenderedBounds()` 是未旋转 AABB；若 rotation 参与框选，必须决定
  “与旋转后外接矩形相交”还是精确多边形相交，DOM 侧不能自行选一个口径。
- 祖先 frame 的 `clip:true` 会让节点只有部分可见；core hit-test 若只看 node 原始
  bounds，会选到用户看不见的部分。
- root 与普通 frame 都有 `data-fw-id`，空白判定不能只看 `closest()` 是否为空。
- 起点若落在生成单元内部按钮上，应由 `data-fw-interaction="ignore"` 或明确的事件
  阻断规则排除，不能开始框选或拖拽。

**Q5 中间态反馈**：

选框作为未变换的屏幕空间 overlay，放在 canvas transform 的同级层，使用容器局部
屏幕坐标绘制，保证边框始终为 1 CSS px。起点/当前点是 renderer 内部瞬时状态；
pointerup 时才调用 `onSelectionChange(ids, mode)`。无需增加 RenderContext 字段。

## 交互 D 点选

**Q1 监听方式**：

使用同一套 pointer 手势状态机，在未超过拖拽阈值的 `pointerup` 阶段完成点选；节点
通过 `event.target.closest('[data-fw-id]')` 解析。读取 `shiftKey`、`ctrlKey`、
`metaKey` 映射 selection mode。空白点击调用
`onSelectionChange([], 'replace')`。

**Q2 原始数据**：

可直接得到命中的 `fwId`、修饰键、button、pointerId 和 client 坐标。DOM 事件不会
给出业务 node，需要 renderer 从最新 `RenderContext.root` 查找该 fwId，以排除
root、locked 或已不存在的节点。

**Q3 缺什么**：

希望 core 提供：

```ts
applySelection(
  current: readonly string[],
  requested: readonly string[],
  mode: SelectionMode,
): readonly string[]
```

renderer 只上报语义请求；应用层用同一纯函数生成最终 selection，避免两侧对
toggle/add 的去重与顺序理解不同。

**Q4 坑与做不到**：

- `click` 会在拖拽结束后继续触发，不能直接给每个 shape 绑 `onClick`；必须由统一
  pointer 状态机用移动阈值抑制拖后点击。
- 双击会先产生 click 序列。第二次 click 若再次执行 toggle，可能把第一次选择抵消；
  应依据 `event.detail`/gesture 状态让一次双击最多改变一次 selection。
- macOS 习惯用 Meta 增选；草案只写 Shift/Ctrl，建议把 Meta 与 Ctrl 同义处理。
- 复合业务单元内部按钮不是 node，但事件会冒泡到 node 外框。必须有内部交互 opt-out
  约定，否则点“重试”会同时选中/拖动节点。

**Q5 中间态反馈**：

提交后的选中高亮继续来自 `RenderContext.selection`。pointer pressed/hover 可以用
renderer 局部状态或 DOM pseudo-class 绘制，不新增字段。只有产品明确要求“切换
renderer 后 hover 也保留”时，才应增加 `hoveredFwId` 会话字段；当前不建议增加。

## 交互 E 拖拽移动

**Q1 监听方式**：

主键 `pointerdown` 命中可移动业务单元后进入 pending-drag；累计移动超过 4 CSS px
才转为 dragging，并调用 `setPointerCapture`。后续使用 `pointermove` 更新预览，
`pointerup` 提交一次，`pointercancel/lostpointercapture` 回滚预览。

**Q2 原始数据**：

DOM 直接提供屏幕空间 pointer 点和 delta，不提供 canvas delta，更不知道节点的父
frame。renderer 能从 `RenderContext.root/selection/viewport` 取得拖拽开始时的节点
快照、选中集和 scale。

**Q3 缺什么**：

希望 core 提供：

```ts
screenDeltaToCanvas(viewport: Viewport, screenDelta: Point): Point
computeNodeMoves(
  root: FrameNode,
  fwIds: readonly string[],
  canvasDelta: Point,
): ReadonlyArray<{
  fwId: string
  parentFwId: string
  x: number
  y: number
}>
```

`computeNodeMoves` 应排除 locked 节点，并处理“frame 与其后代同时被选中”时只移动
最高层选中单元，防止子节点被移动两次。

**Q4 坑与做不到**：

- 草案注释称 `onNodesMove` 的 `x/y` 是“画布坐标”，但 node schema 的 `x/y` 明确
  是**相对父节点坐标**，两者冲突。DOM 侧两种值都能算，但契约必须只留一种语义。
- 多选节点可能分属不同父 frame；只传绝对画布坐标会迫使应用层再次查父节点并反算。
- frame 与后代同时选中时不能分别加同一 delta，否则后代视觉上移动两次。
- 当前不支持拖拽换父级；若未来要 reparent，现有回调没有目标 parent/index，不能
  静默把它塞进 x/y。
- 预览平移不能覆盖 node 已有的 `transform: rotate(...)`，DOM 侧应组合 transform
  或增加预览 wrapper，而不是直接写 `style.transform = translate(...)`。

**Q5 中间态反馈**：

renderer 内保存拖拽开始快照和临时 canvas delta，用 CSS transform/wrapper 预览选中
单元；pointerup 时移除预览并调用一次 `onNodesMove`。不把逐帧位置写入 node 树，
不新增 RenderContext 字段。若应用层拒绝或修正提交，下一次 `update(ctx)` 即覆盖预览。

## 交互 F 激活

**Q1 监听方式**：

监听原生 `dblclick` 或 React `onDoubleClick`，通过
`event.target.closest('[data-fw-id]')` 得到业务单元，排除 root、locked 和带
`data-fw-interaction="ignore"` 的内部控件后调用 `onNodeActivate(fwId)`。

**Q2 原始数据**：

`MouseEvent` 提供 client 坐标、button、detail、修饰键和事件目标。草案只需要 fwId，
DOM 侧可直接给出，不需要上传原生事件。

**Q3 缺什么**：

产出 `onNodeActivate(fwId)` 不缺 core 函数。节点过滤仍可复用 `findNodeById`。如果
以后激活行为需要锚定浮层位置，再单独使用 `screenToCanvas`，不应提前扩展本回调。

**Q4 坑与做不到**：

- `dblclick` 前会出现两个 click/pointerup 序列，必须与 D/E 共用手势状态机，避免
  toggle 两次或启动拖拽。
- 双击内部“重试/生成”等按钮不应激活整个业务单元，需要内部控件 opt-out 约定。
- 双击文本或图片可能触发原生选词/拖图，shape 根需 `user-select:none`，图片需
  `draggable={false}`。

**Q5 中间态反馈**：

双击本身无需 renderer 中间态。若要短暂 pulse，可作为 renderer 局部动画；激活后
打开面板等持久 UI 由应用层管理，不加入 RenderContext。

## Q6 契约缺陷

A-F 的四个草案回调 DOM 侧都给得出来，但有三处必须修正或钉死：

1. `onNodesMove` 的坐标语义不对。建议改为最终的**父节点相对坐标**，并携带
   `parentFwId`：

   ```ts
   onNodesMove(
     moves: ReadonlyArray<{
       fwId: string
       parentFwId: string
       x: number
       y: number
     }>,
   ): void
   ```

   这与 node schema 和持久化 `NodeSlot` 一致。当前 P2 不做 reparent；如果未来做，
   应另加目标 `parentFwId/index` 语义，不能复用本回调偷偷换父级。

2. `onViewportChange` 必须写清频率：平移和 wheel 缩放允许每 animation frame 一次，
   且手势结束/最后一帧必须保证提交。它不能像 `onNodesMove` 一样只在结束时触发，
   因为 wheel 没有可靠结束事件，viewport 又必须跨 renderer 切换保留。

3. `onSelectionChange` 实际表达的是请求而非最终 state。签名可用，但建议命名为
   `onSelectionRequest`；至少要写清 `replace + []` 表示清空、mode 由应用层统一应用。

## Q7 多出来的需求

A-F 本身不需要额外 canvas 回调；`Esc` 清空可以复用
`onSelectionChange([], 'replace')`。

但 P1 已确定 `ai-image/ai-video` 是带内部按钮的复合业务单元，因此必须有一个与
canvas 激活分开的语义动作回调，否则“生成/重试/复跑”只能上传 DOM 事件或被错误
塞进 `onNodeActivate`：

```ts
export type NodeAction = 'generate' | 'retry' | 'rerun'

onNodeAction(fwId: string, action: NodeAction): void
```

内部按钮应标记 `data-fw-interaction="ignore"`，阻止它同时触发点选、拖拽和双击激活。

## Q8 事件冲突

DOM 侧需要一个统一的 pointer gesture state machine，不能给各 shape 分散绑定互相
独立的 click/drag 逻辑。建议优先级：

1. `button === 1`：无条件进入 pan，节点命中无效。
2. `button === 0` 且命中内部 opt-out 控件：交给控件自身。
3. `button === 0` 且命中非 root、非 locked 业务单元：pending-select/drag；移动超过
   4 CSS px 才进入 drag，否则 pointerup 为 click。
4. `button === 0` 且空白或 root：pending-marquee；移动超过阈值画框，未超过则清空
   selection。
5. `wheel`：只要指针在画布容器内就缩放并阻止页面滚动，不与 pointer state 混用。
6. `dblclick`：在 pointer/click 状态机确认没有 drag 后激活；第二次 click 不再执行
   toggle。

共同清理条件是 `pointerup`、`pointercancel`、`lostpointercapture` 和 renderer
`destroy()`。destroy 必须移除 native wheel/pointer/auxclick 监听、取消 RAF，并丢弃
选框/拖拽预览，避免切换 renderer 后旧监听继续回调。

## 最大的三个风险

1. `onNodesMove.x/y` 若继续写成“画布坐标”，会与 node 的父相对坐标形成两份语义，
   多层 frame 下必然写错位置。
2. root frame 的 DOM 覆盖整个画布；若不明确排除 root，“空白框选/空白清空”永远
   无法触发。
3. 复合生成单元的内部按钮会冒泡到业务单元外框；若没有 opt-out 与
   `onNodeAction`，点“重试”会同时触发选中、拖拽或激活。

## 增量补答（interaction-spec 成文后）

### 交互 A′ 平移的另外三种触发

**Q1 监听方式**：容器设 `tabIndex={0}`，聚焦后用 `keydown/keyup` 维护 Space 状态；
Space + 左键沿用 pointer capture 的 pan 状态。`wheel` 用同一个非 passive 原生监听器，
按 `ctrlKey/metaKey`（捏合缩放）→ `shiftKey`（水平平移）→ 普通输入的优先级分派。
另监听 `window.blur`、`visibilitychange` 清除卡住的 Space。

**Q2 原始数据**：键盘侧有 `code/key/repeat/modifier`，pointer 侧有
`clientX/clientY/button/pointerId`；wheel 有 `deltaX/deltaY/deltaMode` 与 modifiers。

**Q3 缺什么**：Space 拖拽和 Shift + wheel 只需 core 的 `panBy()`。但浏览器没有可靠的
设备类型字段，**无法严格区分鼠标滚轮与触控板双指纵向滑动**；`deltaMode === 0`、
非零 `deltaX`、delta 大小都只能做启发式判断。规格必须明确接受启发式，或改成统一语义。

**Q4 坑与做不到**：只有画布键盘域激活且 target 非可编辑控件时才 `preventDefault()`，
否则 Space 会滚页/点击按钮。Shift + wheel 要使用 `deltaY` 作为水平量，并兼容设备原本
已有 `deltaX`；`pointercancel`、失焦和切换 renderer 都必须清状态。

**Q5 中间态反馈**：三种平移都用本地 preview viewport 每 RAF 重绘，并经
`onViewportChange` 同步会话状态；Space 未拖动显示 `grab`，拖动后显示 `grabbing`。

### 交互 B′ 缩放快捷键与视图命令

**Q1 监听方式**：在画布键盘域监听 `keydown`；用 `event.code` 识别
`Equal/Minus/Digit0/Digit1`，避免键盘布局改变字符。命中快捷键后阻止浏览器缩放。

**Q2 原始数据**：DOM 提供容器 `clientWidth/clientHeight` 作为视口尺寸；上下文提供
root、viewport，键盘事件提供 Ctrl/Meta/Shift。快捷键锚点是容器中心，不依赖鼠标。

**Q3 缺什么**：DOM 虽能从 `getRenderedBounds()` 拼包围盒，但不应把渲染结果倒灌成
业务真相。core 应提供 `getContentBounds(root)`、`fitViewport(bounds, viewportSize, 5%)`
和 `centerViewport(bounds, scale, viewportSize)`；明确排除 root、不可见节点，并计算旋转
后的 AABB。空内容时保持当前中心，scale 回到 1。

**Q4 坑与做不到**：必须定义“5%”是视口四边各留 5%（即使用 90% 可用宽高）；嵌套
frame、clip、旋转及 root 是否算内容不能由两侧自行解释。`Ctrl+=` 要兼容主键区和小键盘。

**Q5 中间态反馈**：这是离散命令，算出最终 viewport 后一次回调即可；若以后加过渡动画，
动画只属 renderer preview，最终值仍由应用层持有，renderer 切换时取消动画。

### 交互 G 等比缩放

**Q1 监听方式**：在不受画布 transform 的 selection overlay 中渲染四个 handle；handle
监听 `pointerdown` 并 capture，`pointermove` 预览，`pointerup` 提交，cancel 时回滚。
视觉点可为 8px，外包 20-24px 的透明命中元素，二者尺寸都按屏幕像素固定。

**Q2 原始数据**：需要 handle 方位、起始/当前 client point、选中集包围盒，以及各节点
起始的父相对 `x/y/width/height`、父绝对位置、rotation/locked。

**Q3 缺什么**：core 需按“对角固定、统一 scale factor”计算单选和多选的新几何，并处理
最小尺寸、不同父级与已选祖先去重。现有契约缺提交尺寸的能力，建议新增
`onNodesResize(changes: { fwId, parentFwId, x, y, width, height }[])`，不能滥用
`onNodesMove`。旋转节点的 handle 几何也必须由 core 统一。

**Q4 坑与做不到**：多选跨父级、frame clip、旋转后的屏幕象限、拖过固定角造成翻转都需
定规则；P2 建议 clamp 到最小正尺寸，不允许翻转。命中层必须高于节点且阻止点选/拖拽。

**Q5 中间态反馈**：renderer 保存起始快照与临时变换，仅改 overlay/节点预览；松手一次
提交。cancel、Esc 或 destroy 丢弃 preview，不能改 node 树。

### 交互 H 键盘操作

**Q1 监听方式**：画布容器使用 `tabIndex={0}` 和 `keydown/keyup`，pointerdown 画布时主动
focus。焦点离开画布就不响应；`input/textarea/select/button/[contenteditable]` 内一律放行，
不使用无条件 window 快捷键。

**Q2 原始数据**：事件提供 `code/key/repeat` 与 modifiers；上下文提供 selection/root，
容器焦点决定快捷键作用域。方向键 delta 为画布坐标 1 或 10，不随 viewport.scale 改变。

**Q3 缺什么**：全选/清空复用 selection 回调，方向键可复用明确为父相对结果的
`onNodesMove`；删除必须新增 `onNodesDelete(fwIds)`。core 还应提供可选业务单元遍历、
锁定过滤及批量 nudge 计算，避免嵌套选中重复移动。

**Q4 坑与做不到**：需 `preventDefault()` 阻止 Ctrl+A 选网页、Backspace 导航和方向键滚页；
IME composing 时不处理。长按方向键的 repeat 若逐次提交会污染撤销日志，建议一次按住期间
本地预览，keyup 合并成一次提交；blur 时也要提交或回滚，契约必须定死。

**Q5 中间态反馈**：全选/清空/删除是离散请求，无 renderer 中间态；长按微调按拖拽同样
使用本地 preview，松键提交一次。删除由应用层改树后通过 `update(ctx)` 反映。

### 交互 I 不随缩放变化的视觉元素

**Q1 监听方式**：首选在 transformed content sibling 上建立未缩放的绝对定位 overlay，
用 `canvasToScreen()` 投影选中几何；描边直接 2 CSS px、handle 固定 CSS px，无需反向缩放。
备选是在内容层中设置 `border-width: calc(2px / scale)`、handle 尺寸为 `size / scale`。

**Q2 原始数据**：需要 viewport、容器 rect、单元的画布几何及 rotation；多选还需 core
给出的整体包围盒。`devicePixelRatio` 只影响锐度，不改变 CSS px 规格。

**Q3 缺什么**：core 只需统一投影点/旋转矩形/包围盒；overlay 的 DOM 结构和 CSS 属于
renderer。若继续使用反向补偿，`scale` 必须先钳制在 0.1-4，不能出现零或负数。

**Q4 坑与做不到**：投影结果常有 0.5px 等小数，浏览器会抗锯齿，无法保证每个 DPR 下都
落在物理像素整数边界。不要独立取整各点，否则选框会漂；接受亚像素，必要时只对纯水平/
垂直描边做 DPR 对齐。overlay 还要同步滚动、resize、rotation 与 frame clip 语义。

**Q5 中间态反馈**：viewport 或 preview geometry 每帧变化时只重算 overlay 投影；它不进
RenderContext。renderer destroy 时移除 overlay 和 RAF。

### 交互 J 光标反馈

**Q1 监听方式**：容器维护单一 gesture/hover 状态并映射到 `style.cursor` 或 `data-cursor`；
节点与 handle 只上报 hover 命中，不各自持有冲突的光标状态。handle 按角映射两种 resize。

**Q2 原始数据**：使用当前 gesture、Space 状态、pointer 命中目标、handle 方位、节点
rotation/locked；不需要把原生事件上抛。

**Q3 缺什么**：不缺 core 回调；若旋转节点也可缩放，core 应提供旋转后角点对应的光标
方向，避免 DOM 与 Leafer 各自判断后不一致。

**Q4 坑与做不到**：pointer capture 后真实 hover target 不再可靠，手势期间必须由状态机
强制 cursor。优先级建议 resize > grabbing > crosshair > grab > move > default；locked
节点保持 default。Space keyup、blur、pointercancel/lostcapture、destroy 都走同一 reset。

**Q5 中间态反馈**：cursor 本就是 renderer 本地瞬时状态，不进入 RenderContext；reset 后
根据当前 hover/Space 重新派生，而不是硬编码回 `default`。

## 增量补答后的三个主要风险

1. 浏览器无法可靠区分鼠标滚轮与触控板双指纵向滑动，当前规格要求两者产生不同语义。
2. 等比缩放与删除没有语义层回调；若不补契约，只能泄漏 DOM 事件或偷用错误回调。
3. 多选缩放、键盘微调横跨不同父级时，结果必须保持父相对坐标并去重已选祖先。
