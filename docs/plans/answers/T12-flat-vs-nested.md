# T12 — 「场景图打平 vs 嵌套」评估

> 评估人：renderer-leafer 实现者（Kimi）。只评估，不改代码。
> 行号引用均为当前 `main` 实际读到的文件：
> `packages/renderer-leafer/src/index.ts`（78 行）、`packages/renderer-leafer/src/shapes/registry.ts`（73 行）。

---

## 1. 现状核实：当前是怎么组织场景图的

**所有节点都是 leafer 根的直接子节点，frame 的容器性没有被使用。**

- `index.ts:35` — `parent.add(ui)`：节点挂到传入的 parent。
- `index.ts:37-42` — frame 的子节点递归时传的是 **`leafer as Leafer`（第 40 行）而非 frame 自己的 `ui`**，注释写明理由：「子节点同样使用画布绝对坐标，故父级传 leafer 根而非 ui，避免双重偏移」（第 38 行）。
- `index.ts:25` — 绝对坐标由 `buildNode` 手工累加（`parentAbsolute + node.x/y`），Leafer 的父子变换级联被完全绕开。
- `registry.ts:31-38` — frame 建成了 `Box` 并设了 `overflow: clip ? 'hide' : 'show'`，但因为它内部没有任何子节点，**`overflow` 是摆设**。
- `index.ts:49-51` — viewport（scale/offset）设在 leafer 根实例上，与场景图结构无关，两种方案下都不变。

## 2. 改成嵌套要动什么

| 位置 | 改动 | 行数量级 |
|---|---|---|
| `index.ts:40` | 子节点的 parent 从 `leafer` 改为 frame 的 `ui` | 1 行 + 类型收窄 |
| `index.ts:25` / `registry.ts` 各 factory | 传给 `toLeaferProps` 的坐标从「画布绝对」改为「父相对」（即直接用 `node.x/y`）；`ShapeContext.absolute` 语义改名 | ~10 行 |
| `index.ts:26-31`（bounds 收集） | **不动。** bounds 是递归时顺路累加自报的，`parentAbsolute` 参数本来就在，与节点挂在哪无关 | 0 行 |
| `node-props.test.ts` | 第二参数语义从绝对改为父相对，期望值机械更新 | ~10 行 |
| 根 frame | root 也成为真正的 `Box` 容器；demo root `clip` 默认 false → `overflow:'show'`，行为不变 | 0 行 |

**合计 ~20–30 行 + 测试机械更新。** `getRenderedBounds()` 的画布绝对坐标语义（契约要求）**不受影响**——它自报累加值，本来就没从场景图回读（T9b「自报而非测量」那条此时反而成了改动绝缘层）。

安全网：`pnpm verify` 的 parity + 几何基线。改完基线不变 = 几何零漂移，这件事是机器可判定的。

## 3. 嵌套能白拿什么

1. **`clip` 真正生效**：`overflow:'hide'`（registry.ts:35）从摆设变实话。
2. **拖拽 frame 不用维护后代映射**：预览时改 frame 自身的 x/y，子树随 Leafer 父子变换自动跟随。flat 方案要的「fwId → 全部后代」映射整个消失。
3. **`visible` / `opacity` 级联（本次评估新发现的第三个差异，此前未报过）**：flat 下每个节点的 `visible` 独立映射，子节点与 frame 平级——**`frame.visible = false` 只隐藏 frame 的背景 Box，其子节点照样渲染**（index.ts:37-42 递归不检查父级可见性）。DOM 侧嵌套 `display:none` 天然级联。即：当前两版在「隐藏一个 frame」时**视觉不一致，而 bounds parity 测不出来**（bounds 不看可见性）。嵌套后 Leafer 原生级联，与 DOM 对齐。
4. **透明 frame 的命中语义更自然**：嵌套后 frame 用 `hitFill` 策略只命中边框区域，内部穿透——正好落地契约裁决 11（透明 frame 内部算空白）。
5. **z 序局部化**：兄弟排序约束在每个父容器内部，与 schema 的 children 数组完全同构（flat 下也成立，此项打平，列出仅作完整性）。

## 4. 嵌套会引入什么新代价

1. **坐标系对得上吗——对得上，而且比 flat 更对得上。** Leafer 子节点相对父容器定位，schema 的 `x/y` 就是父相对坐标（domain §3.3 规则 1），嵌套后两者**同构**，`index.ts:25` 的手工累加对渲染而言可以删掉（bounds 收集仍需要累加，但那是为我们自己的契约服务）。flat 才是绕开原生机制的那个。
2. **`getRenderedBounds` 要不要额外换算——不要。** 继续自报累加值（见 §2）。若改成从 Leafer 回读（`getWorldPoint` 等）才需要换算，不建议换。
3. **多层嵌套的性能**：变换矩阵沿层级级联，这是 Leafer 的原生路径（worldTransform 有缓存），节点量级在数百以内无需担心；严格说**未实测**，但这不是 flat 换来的优势——flat 同样每帧全量重建（index.ts:47 的 `leafer.clear()`），性能瓶颈在「全量重建」不在「嵌套」。
4. **真正的代价（如实列）**：
   - 渲染树结构与数据树结构耦合——将来若有「跨 frame 的全局 overlay」（对齐参考线等，契约 §6 方向），需要在嵌套树之外再开根级 overlay 层。但选中框/控制点/选框本来就计划在根级 overlay，与嵌套不冲突。
   - 带 `rotation` 的 frame，其子节点坐标系是旋转过的，移动预览的画布 delta 要经旋转逆变换。flat 下同层节点的旋转也是各自处理，**此项两方案打平**；且契约裁决 9 已定首版按 AABB 处理。
   - 改动期回归风险：有 parity + 基线双网兜底，风险低。

## 5. 对 P2 每一项交互的影响（按契约 §4 / §5）

| 交互 | flat | 嵌套 | 谁更简单 |
|---|---|---|---|
| A 平移 / B 缩放 | viewport 在根，无差异 | 同左 | 打平 |
| C 框选 | `collectNodesInRect` 在 core 不变；「起点空白」判定靠 target，透明 frame 要调 `hitFill` | 同左，但 frame 命中语义更自然（§3-4） | 嵌套略优 |
| D 点选 | `data.fwId` 通道不变 | 同左 | 打平 |
| E 拖拽移动 | 预览要自维护「fwId → 全部后代」映射，整组改 x/y | 改被选项自身 x/y，后代自动跟随；映射整个消失 | **嵌套明显优** |
| F 激活（双击） | 无差异 | 同左 | 打平 |
| G 等比缩放 | 控制点在根级 overlay，几何走 `core.resizeProportional` | 同左 | 打平 |
| 隐藏/透明度 | frame 的 visible/opacity **不级联，与 DOM 不一致**（§3-3） | 原生级联，与 DOM 对齐 | **嵌套优（正确性）** |
| `clip` | 空转，要生效需另做 mask | `overflow:'hide'` 直接生效 | **嵌套优** |
| core 函数清单（§5） | 全部不变（`computeMoves` / `collectNodesInRect` 等与场景图结构无关） | 同左 | 打平 |

## 6. 推荐与判据

**推荐：改嵌套，时机 = P2 开工前（或 P1 期间顺手，P1 不碰渲染交互，是风险最低的窗口）。**

判据（三条，按权重）：

1. **成本不对称**。改嵌套 ~20–30 行 + 机械测试更新，有 parity + 基线机器判定对错；留 flat 则 E 拖拽、clip、visible 级联每一项都要补税，且税是一次性投入换不来的——每加一个涉及层级的交互就再交一次。
2. **已经出现正确性分歧，不是假想敌**。`frame.visible = false` 两版视觉不一致（§3-3）是现状 bug 级别的差异，parity 还测不出来。flat 的「够用」在 P0 静态渲染成立，在 P2 不成立。
3. **嵌套让 schema 坐标系与 Leafer 坐标系同构**（§4-1），少一层手工累加 = 少一类「两边对同一份数据理解不同」的 bug——这正是本项目要消灭的东西。

**例外国界（诚实声明）**：如果 P1 对「分镜组」的定性（开环 7）结果是 frame 基本只剩 root 一层、嵌套 frame 在产品上近乎不存在，那么 flat + 两个 core helper（`collectDescendantIds`、visible 级联递归）也能活——那时改嵌套就是过度工程。**但即便在那种未来里，§3-3 的 visible 级联分歧也得修**，而修它的成本已经接近改嵌套的成本，所以我的推荐不变。

**主要风险**：低。唯一需要盯住的是改完 `pnpm verify` 的几何基线必须**零变化**——变了就说明累加口径改错了，当场可判。
