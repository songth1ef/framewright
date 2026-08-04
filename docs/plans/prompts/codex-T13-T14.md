# Codex 工作指令 —— T13 可见性级联 + T14 场景图改嵌套

仓库根目录 `E:\code\github\framewright`。当前 `main` 与 `origin/main` 同步，`pnpm verify` 全绿。

## 0. 先读

1. `AGENTS.md` —— 行为规则、三条铁律、禁止项。**优先级最高。**
2. `docs/renderer-contract.md` —— **T11 定案的渲染器契约**，本次要扩展它，扩展方式下面已给定
3. `docs/plans/answers/T12-flat-vs-nested.md` —— 改嵌套的评估与改动清单（Leafer 侧实现者出的，含行号）
4. `docs/domain.md` §3.3 —— node 模型规则，尤其**规则 1（坐标是父相对）**与**规则 7（禁止整体展开）**

## 1. 背景：一个已核实的真分歧

**`frame.visible = false` 时，两个渲染器行为不一致：**

- `renderer-dom`：子节点在 frame 的 `<div>` 里面，`display:none` **天然级联**，整个子树消失 ✅
- `renderer-leafer`：`src/index.ts:37-42` **无条件递归**子节点、且把它们 `add` 到 leafer 根（第 40 行），全程不检查父级可见性 → **只有 frame 自己的背景 Box 消失，子节点照常渲染** ❌

**而现有 parity 测试测不出来**——它只比对 `getRenderedBounds()`，而 bounds 不反映可见性。

**更要紧的是**：两侧的 `getRenderedBounds()` 都是**自报累加值，不是从渲染结果实测**。所以「两侧自报互相比对」这种测法，在两边一致地错时会一起变绿。本次要顺手补上这个盲区。

---

## 2. T13 —— 可见性级联：语义进 core，两侧遵守，测试能测出来

**这一步做完，可见性测试应该是红的**（因为 Leafer 侧还是 flat）。**红是预期结果，不要为了让它绿而去改 Leafer 的递归逻辑**——那是 T14 的事。

### Step 1：core 新增可见性级联的单一真相源

新建 `packages/core/src/visibility.ts`：

```ts
import { type CanvasNode, type FrameNode, isFrameNode } from './node-schema'

/**
 * 有效可见性 = 自身 visible 且全部祖先 visible。
 * 这是可见性级联语义的**单一真相源**：两个渲染器都必须渲染出与本函数一致的结果，
 * 谁都不许自己实现一套级联规则。
 */
export function collectVisibleNodeIds(root: FrameNode): readonly string[] {
  const visible: string[] = []
  const walk = (node: CanvasNode): void => {
    if (!node.visible) return          // 自身不可见 → 整棵子树都不可见
    visible.push(node.fwId)
    if (isFrameNode(node)) {
      for (const child of node.children) walk(child)
    }
  }
  walk(root)
  return visible
}

/** 单点查询，语义与 collectVisibleNodeIds 一致。 */
export function isEffectivelyVisible(root: FrameNode, fwId: string): boolean {
  return collectVisibleNodeIds(root).includes(fwId)
}
```

从 `packages/core/src/index.ts` 导出。

### Step 2：先写失败的单测

新建 `packages/core/src/visibility.test.ts`。**必须覆盖**：

- 全部可见时返回全部 fwId
- 叶子节点 `visible:false` 时只少它自己
- **frame `visible:false` 时，它与它的全部后代一起消失**（级联的核心用例）
- 多层嵌套下的级联
- `isEffectivelyVisible` 与 `collectVisibleNodeIds` 结果一致

跑 `pnpm vitest run packages/core/src/visibility.test.ts`，**先确认它因「模块不存在」而失败**，再写实现。

### Step 3：契约扩展 —— adapter 新增 `getVisibleNodeIds()`

在 `packages/core/src/renderer-adapter.ts` 的 `RendererAdapter` 接口上加：

```ts
  /**
   * 自报「我实际画出来了哪些节点」，用于断言可见性级联。
   * 与 getRenderedBounds() 一样是自报——但断言时不是拿两侧自报互相比，
   * 而是各自与 core.collectVisibleNodeIds() 的独立计算比对，
   * 从而避开「两侧一致地错、测试照样绿」的盲区。
   */
  getVisibleNodeIds(): readonly string[]
```

同步更新 `docs/renderer-contract.md`：在 §1/§2 之后加一小节说明这个方法及其存在理由（避开自报盲区）。

### Step 4：两个渲染器实现 `getVisibleNodeIds()`

- `renderer-dom`：返回实际渲染进 DOM 的节点 fwId
- `renderer-leafer`：返回实际 `add` 进场景图的节点 fwId

**两侧都必须如实反映自己的实际渲染行为，不许直接转调 `core.collectVisibleNodeIds()` 交差**——那样测试就变成自己跟自己比，等于没测。

### Step 5：写可见性的 e2e 测试（**预期变红**）

在 `apps/web/components/renderer-host.tsx` 加一个 `data-testid="toggle-inner-frame"` 的按钮，切换 `inner-frame` 的 `visible`；并把 `getVisibleNodeIds()` 也经 `window.__fwGetVisible` 暴露（与既有 `__fwGetBounds` 同样的挂载与清理方式）。

新建 `e2e/visibility.spec.ts`，对**两个渲染器各测一遍**：

1. 初始状态：`getVisibleNodeIds()` 等于 `core.collectVisibleNodeIds()` 的期望集合（7 个节点）
2. **隐藏 `inner-frame` 后**：`inner-frame` 与 `nested-box` **都**不在返回集合里（级联）

```bash
pnpm e2e e2e/visibility.spec.ts
```

**预期：DOM 侧两条通过，Leafer 侧第 2 条失败**（它只藏了 frame 自己，`nested-box` 还在）。

**看到这个失败就停下，commit，然后进 T14。** 不要在这一步去改 Leafer 的递归。

### Step 6：commit

```
feat(core): 可见性级联语义进 core,adapter 新增 getVisibleNodeIds

frame.visible=false 时应级联隐藏整棵子树。语义定在 core.collectVisibleNodeIds,
两个渲染器都必须渲染出与之一致的结果,谁都不许自己实现一套级联规则。

adapter 加 getVisibleNodeIds() 自报实际渲染了哪些节点。断言时不拿两侧自报互相比,
而是各自与 core 的独立计算比对 —— 避开「两侧一致地错、测试照样绿」的盲区。
两侧 getRenderedBounds 也是自报,这个盲区此前一直存在。

e2e/visibility.spec.ts 当前 Leafer 侧第 2 条预期失败(它把子节点 add 到 leafer 根、
递归时不检查父级可见性),留待 T14 改嵌套后转绿。
```

---

## 3. T14 —— `renderer-leafer` 场景图改嵌套

改动清单已由 Leafer 侧实现者在 `docs/plans/answers/T12-flat-vs-nested.md` §2 给出（带行号），**照它做**，约 20–30 行 + 测试机械更新。

### 要点

1. `src/index.ts:40` —— 子节点的 parent 从 `leafer` 根改为 **frame 自己的 `ui`**
2. 传给 `toLeaferProps` 的坐标从「画布绝对」改为「**父相对**」（即直接用 `node.x/y`），`ShapeContext.absolute` 的语义与命名相应调整
3. **`getRenderedBounds()` 的语义不变**——它仍返回**画布绝对坐标**，仍由递归时顺路累加自报，与节点挂在哪无关。**这一段不要动**
4. 递归时**尊重父级可见性**，使 T13 的测试转绿
5. `node-props.test.ts` 的第二参数语义随之改为父相对，期望值机械更新

### 🔴 硬性验收：几何基线必须零变化

改完跑：

```bash
pnpm verify
```

**`e2e/geometry-baseline.spec.ts` 的两个基线必须一个数字都不变。**

- **变了 = 坐标累加口径改错了，立即停下上报**，不要用 `--update-snapshots` 把它抹平
- 这是本次改动唯一的、也是最强的安全网：几何零漂移这件事是机器可判定的

同时确认：

- `e2e/parity.spec.ts` 仍绿（两侧几何仍完全一致）
- `e2e/visibility.spec.ts` **全部转绿**（Leafer 侧级联生效）
- `pnpm test` 全绿

### commit

```
fix(renderer-leafer): 场景图改嵌套,修复 visible 不级联

子节点从 add 到 leafer 根改为 add 到 frame 自身容器,坐标随之从画布绝对改为父相对
—— 与 node schema「x/y 是父相对」同构,少一层手工累加。

连带修复三件事：
· frame.visible=false 现在级联隐藏整棵子树,与 DOM 侧一致(T13 测试转绿)
· frame 的 clip 从摆设变实话(overflow:'hide' 真正生效)
· 拖拽 frame 不再需要自维护「fwId → 全部后代」映射(P2 收益)

getRenderedBounds 语义不变(仍为画布绝对坐标、仍自报累加),
几何基线零变化 —— 这是本次改动的机器可判定安全网。
```

---

## 4. 硬性纪律

- **严格按 T13 → T14 顺序**，T13 结束时测试是红的，这是预期，**不许提前修**
- **只做 T13 和 T14**，不许顺手做别的
- **不许改计划、不许扩范围**
- **不许 `git push`**，只 commit
- **不许 `--no-verify`**，不许用 `--update-snapshots` 抹平基线变化
- 每步「先写失败测试 → 跑一遍确认它真的失败 → 再实现」，确认失败那步不许跳过

## 5. 回报格式

```
任务号：T13 / T14
状态：完成 / 受阻
新建文件：<路径列表>
修改文件：<路径列表>
测试命令与输出：<原样粘贴,不要概括>
  · T13 阶段：visibility.spec.ts 的失败输出(证明 bug 真实存在)
  · T14 阶段：pnpm verify 完整输出 + 基线零变化的证据
commit：<sha> <message 首行>
偏差：<与指令不一致处；没有就写「无」>
接口摩擦：<改嵌套过程中觉得契约/schema 别扭的地方；没有就写「无」>
```
