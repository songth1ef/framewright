# Codex —— 波次 1：A1 `viewport.ts` + A2 `hit-test.ts`

仓库根 `E:\code\github\framewright`。

## 0. 先读

1. `AGENTS.md` —— 铁律与禁止项，优先级最高
2. `docs/plans/2026-08-03-任务板.md` §2 通用纪律、§3 冲突规避 —— **每个任务都适用，不再重复**
3. `docs/renderer-contract.md` §5 —— **函数签名已给定，照抄，不许自行改签名**
4. `docs/interaction-spec.md` §1–§2 —— 缩放范围、框选判定等硬性规则

**你的任务与 Kimi 的（A3/A4/B1）文件零重叠，可同时开工。** `git add` 按路径，**不许 `git add -A`**。

## 1. A1 —— `packages/core/src/viewport.ts`

纯 TS，零渲染依赖。TDD：每个函数先写失败测试。

### 语义（不许自行发挥）

```ts
/** 屏幕坐标 → 画布坐标：canvas = (screen - offset) / scale */
screenToCanvas(viewport: Viewport, screenPoint: Point): Point

/** 画布坐标 → 屏幕坐标：screen = canvas * scale + offset */
canvasToScreen(viewport: Viewport, canvasPoint: Point): Point

/** 平移发生在屏幕空间：offset += delta，**不除以 scale** */
panBy(viewport: Viewport, deltaScreenX: number, deltaScreenY: number): Viewport

/** 以光标为锚点缩放 */
zoomAtPoint(viewport: Viewport, anchorScreen: Point, factor: number,
            limits: { min: number; max: number }): Viewport

clampScale(scale: number, min: number, max: number): number

/** wheel 的 deltaY 归一化成「格数」 */
normalizeWheelSteps(deltaY: number, deltaMode: number): number

/** 全部节点的包围盒（画布坐标），供 Shift+1 适应内容用 */
getContentBounds(root: FrameNode): Rect
```

### 🔴 `zoomAtPoint` 的硬性语义

**缩放前后，光标下的那个画布点必须停在原处。** 这是最容易实现错的地方——错了的表现是**画布往光标反方向滑走**。

正确算法：

```
anchorCanvas = screenToCanvas(viewport, anchorScreen)      // 先记住光标下是哪个画布点
newScale     = clampScale(viewport.scale * factor, min, max)
newOffsetX   = anchorScreen.x - anchorCanvas.x * newScale  // 反解 offset，让该点回到原屏幕位置
newOffsetY   = anchorScreen.y - anchorCanvas.y * newScale
```

**必须有一条专门抓这个 bug 的测试**：

```ts
it('缩放后光标下的画布点仍在原屏幕位置', () => {
  const vp = { scale: 1, offsetX: 30, offsetY: 50 }
  const anchor = { x: 200, y: 150 }
  const before = screenToCanvas(vp, anchor)
  const after = zoomAtPoint(vp, anchor, 2, { min: 0.1, max: 4 })
  const back = canvasToScreen(after, before)
  expect(back.x).toBeCloseTo(anchor.x)
  expect(back.y).toBeCloseTo(anchor.y)
})
```

再补一条 `factor` 为缩小（0.5）的同类断言，以及**钳制生效时锚点仍不动**的断言（scale 撞到 min/max 时，`newScale` 用钳制后的值反解，锚点依然不动）。

### `normalizeWheelSteps` 的语义

`deltaMode`：`0` = 像素、`1` = 行、`2` = 页。先统一折算成像素，再除以每格像素数：

```
px = deltaMode === 1 ? deltaY * 16
   : deltaMode === 2 ? deltaY * 400
   : deltaY
steps = px / 100
```

**为什么必须在 core**：鼠标 `Ctrl`+滚轮是一格一格的大 delta（≈100），触控板捏合被浏览器合成的 `ctrl+wheel` 是小额连续 delta。归一化常数若不统一，**鼠标与触控板的缩放速度手感会不一致，而 parity 测试测不出来**（几何对、体感不对）。

### `getContentBounds`

用已有的 `walkTree` 求全部节点绝对矩形的并集。空树（root 无子节点）返回 root 自身的矩形。

### 边界与否定用例（必测）

- `scale` 非 1 时的往返换算（`canvasToScreen(screenToCanvas(p))` 恒等）
- `clampScale` 上下界与边界值
- `panBy` 不受 `scale` 影响
- `getContentBounds` 覆盖嵌套节点（用 `createDemoDocument()`）

### commit

```
feat(core): 视口数学 —— 坐标换算、平移、锚点缩放、wheel 归一化

zoomAtPoint 保证光标下的画布点缩放前后不动(含钳制生效时),有专测。
normalizeWheelSteps 统一鼠标大 delta 与触控板连续 delta 的归一化,
不统一会让两侧缩放手感不一致而 parity 测不出来。
```

## 2. A2 —— `packages/core/src/hit-test.ts`

```ts
/** 两角点归一化成 Rect，容忍负宽负高 */
rectFromPoints(a: Point, b: Point): Rect

/** AABB 相交判定。**边界接触算相交**（框选要宽容） */
intersects(a: Rect, b: Rect): boolean

/** 框选：与 rect **相交**（不是完全包含）的全部可选业务单元 */
collectNodesInRect(root: FrameNode, rect: Rect): readonly string[]

/** 点命中：返回**最上层**可选业务单元；空白返回 null */
hitTestPoint(root: FrameNode, canvasPoint: Point): string | null
```

### 硬性规则（来自 `interaction-spec.md` §2 与契约裁决）

1. **框选用「相交」不用「完全包含」**——要求完全框住会让大对象几乎选不中（Figma 行为）
2. **排除三类**：root 节点、`locked` 节点、有效不可见节点（用 `collectVisibleNodeIds` 判定，含祖先级联）
3. **`rotation` 首版一律按未旋转包围盒（AABB）处理**（契约裁决 9）
4. **`hitTestPoint` 返回最上层**：兄弟数组顺序即 z 序、靠后在上，所以深度优先遍历中**最后一个命中者**就是最上层
5. 返回顺序：`collectNodesInRect` 按 `walkTree` 的深度优先顺序，保证确定性

### 必测

- 相交但不包含 → 选中（这条是「相交 vs 包含」的分水岭）
- 边界恰好接触 → 选中
- 完全不重叠 → 不选中
- `locked` 节点不被框选、不被点选
- 祖先 `visible:false` 的节点不被框选、不被点选（级联）
- root 永不出现在结果里
- `hitTestPoint` 在重叠区域返回**靠后**（上层）那个
- `rectFromPoints` 对四个方向的拖拽都归一化正确

> ⚠️ A2 依赖 `collectVisibleNodeIds`（T13 产出）。若你做 A2 时 T13 尚未落地，**先做 A1，回报时说明 A2 被 T13 挡住**，不要自己再写一份可见性级联逻辑——那会造出第二个真相源。

### commit

```
feat(core): 命中测试 —— 框选相交判定与点命中

框选用相交(非完全包含),排除 root/locked/有效不可见(含祖先级联),
rotation 首版按 AABB。hitTestPoint 取深度优先中最后一个命中者 = 最上层。
```

## 3. 回报

```
任务号：A1 / A2
状态：完成 / 受阻
新建文件：<路径列表>
修改文件：<路径列表>
测试命令与输出：<原样粘贴>
commit：<sha> <message 首行>
偏差：<没有就写「无」>
接口摩擦：<觉得契约签名别扭的地方；没有就写「无」>
```
