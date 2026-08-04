# domain — 领域模型与术语

> 核心概念、术语表、node 模型规则。改这里等于改产品语义，须与用户确认。

---

## 1. 一句话领域描述

用户在一块**无限画布**上摆放节点，节点可以是容器（frame）、图形块（box）、图片（img）、视频（video）；
用户对节点发起 **AI 生成**请求（文生图 / 图生图 / 文生视频等），生成结果作为新的 img/video 节点落回画布；
整块画布的全部状态序列化成**一棵 JSON node 树**，由后端持久化，任何渲染器读同一棵树都应渲染出同一个画面。

对标形态：liblib canvas、即梦。定位偏**影视创作**（分镜、素材编排），不是通用设计工具。

## 2. 术语表

| 术语 | 含义 |
|---|---|
| **Document（文档 / 画布）** | 一个画布工作台的完整内容。用户打开的「一张画布」就是一个 Document。**它有自己的 `id`，那个 id 就是后端存储的主键与一切读写的入口**，见 §2.1。 |
| **Node（节点）** | 画布上的一个元素。所有可见内容都是 node。 |
| **Node 树** | Document 的全部 node 按父子关系组成的树。**是唯一真相源**——渲染、持久化、协作、撤销重做全部基于它。 |
| **Renderer（渲染器）** | 把 node 树画到屏幕上、并把用户交互抛回来的实现。本项目并行两套：`renderer-dom`（Next.js/tsx 组件）与 `renderer-leafer`（LeaferJS 节点封装），**可在运行时一键切换**。 |
| **Viewport（视口）** | 画布的观察状态：缩放倍率 `scale` + 平移偏移 `offsetX/offsetY`。属于**会话状态**，不进 Document 持久化，但**切换渲染器时必须保留**。 |
| **Selection（选中集）** | 当前被选中的 node id 集合。同为会话状态，同样必须跨渲染器切换保留。 |
| **Provider（生成方）** | AI 生成能力的提供方抽象。输入生成参数，输出素材 URL。仓内只有 mock 实现。 |
| **Generation（生成任务）** | 一次 AI 调用的生命周期：提交 → 排队/进行中 → 成功（产出素材）或失败。 |

## 2.1 Document 与它的 id

```ts
interface Document {
  id: string          // 画布 id —— 后端存储主键、URL 路径段、一切读写的入口
  name: string
  root: FrameNode     // node 树的根
  historySeq: number  // 当前所处的历史序号，见 §6
  createdAt: string
  updatedAt: string
}
```

- **`id` 不加 `fw` 前缀**——按 §3.1.1 的边界规则，前缀只用于 node schema；Document 不进渲染器，不存在与渲染器属性同名的风险。
- **`id` 是唯一入口**：读画布、存画布、查历史、发起生成，全部以 `documentId` 为键。前端路由 `/canvas/{documentId}`。
- **`root.fwId` 与 `Document.id` 是两回事**：前者是文档**内部**的节点标识（恒为 `'root'`），后者是文档**之间**的标识。别混。

## 2.2 🔴 节点粒度原则（决定 schema 怎么拆的唯一依据）

> **node 树的粒度 = 用户选中的粒度 = 业务单元的粒度。**

一个 node **不是**一个视觉元素，而是**一个用户会整体选中、整体移动、整体删除的东西**。

用户不会去选中「那张 AI 生成图下面的 prompt 标签」，他选的是**那张生成结果**整体。所以：

- ✅ 一个 `ai-image` 是**一个 node**
- ❌ 它内部的图片本体、生成中遮罩、prompt 摘要条、hover 操作条**都不是 node**，是该 shape 的内部实现细节

### 这条规则带来三个连锁好处

1. **命中测试天然正确**——不需要额外写逻辑去「抑制选中子元素」，因为子元素压根不在树里。
2. **`getRenderedBounds()` 报的就是选中框该画的位置**——业务单元的整体外框。
3. **⭐ 它让「两版同步」变简单，不是变难**——parity 只需断言**业务单元的外框一致**，内部布局允许两侧各用各的最优解：DOM 侧可以用 flex / grid，Leafer 侧可以用绝对定位。**约束反而放宽了。**

### 所以「按 type 拆得太细」的担心不成立

拆分依据不是「有几种视觉形状」，而是「有几种业务单元」。业务单元的种类天然很少：

| 分类 | fwType | 有生成生命周期？ | 说明 |
|---|---|---|---|
| 容器 | `frame` | — | 画板 / 分组容器 |
| **生成单元** | `ai-image` `ai-video` | ✅ 有 | **一等公民**。带生成态、参数、结果，渲染成复合视觉 |
| 纯素材 | `img` `video` | ❌ 无 | 用户上传或拖入的参考素材，只有 `src` |
| 测试载体 | `box` | ❌ 无 | 仅用于几何对照测试，**不是产品元素**，见 `AGENTS.md` §1.1 |

`ai-image` 与 `img` 的区别只有一个：**有没有生成生命周期**。有的话就带 `status` / `prompt` / `params` / `generationId`，用户能看到它在生成、能看到参数、能一键复跑。

## 3. Node 模型

### 3.1 通用字段

每个 node 都有：

| 字段 | 类型 | 说明 |
|---|---|---|
| `fwId` | `string` | 文档内唯一，创建时生成，永不复用 |
| `fwType` | `'frame' \| 'box' \| 'img' \| 'video'` | 判别字段，决定其余字段形状 |
| `name` | `string` | 用户可见名称，图层面板显示用 |
| `x` `y` | `number` | 相对**父节点**左上角的偏移 |
| `width` `height` | `number` | 尺寸 |
| `rotation` | `number` | 旋转角度（度） |
| `opacity` | `number` | 0–1 |
| `visible` | `boolean` | 是否渲染 |
| `locked` | `boolean` | 锁定后不可选中拖动 |
| `children` | `Node[]` | 仅 `frame` 有；其余类型无此字段 |

### 3.1.1 `fw` 前缀约定

`fwId` / `fwType` 带 `fw` 前缀，其余字段（`x` `y` `width` `name` …）不带。这不是随手起的名，规则是：

> **凡是「framewright 语义」而非「几何/呈现语义」的字段，一律加 `fw` 前缀。**

`fwId` 是我们的身份标识、`fwType` 是我们的判别字段——它们**只对 framewright 有意义**，且恰好与渲染器原生的 `id` / `type` 同名。前缀让代码里任何一处都能一眼看出「这是我们的数据，不是渲染器的属性」。后续再加此类字段（如 `fwVersion`、`fwLocked`）同样加前缀。

**前缀的适用边界**：只用于 **node schema**。`Generation` 等不进入渲染器的数据结构保持 `id` 不带前缀——前缀的两条理由（与渲染器原生字段同名、需要在混杂上下文里一眼辨归属）对它们都不成立，硬加只会变成噪音。

**⚠️ 但前缀不是防冲突的真正防线。** 必须认清一个事实：**LeaferJS 的节点属性 `x` `y` `width` `height` `rotation` `opacity` `visible` `name` `children` 与我们的字段全部同名。** 只给两个字段加前缀，反而会造成「其余字段是安全的」这种错觉。

真正的防线是下面这条铁律（见 §3.3 规则 7）：**禁止把 node 对象整体展开进渲染器节点。**

### 3.2 各类型专有字段

- **frame** — 容器。可嵌套任意类型（含 frame 自身）。额外有 `clip: boolean`（是否裁剪超出边界的子节点）、`background`。
- **box** — 纯图形块（矩形起步）。额外有 `fill`、`cornerRadius`、`stroke`。
- **img** — 纯素材图片（用户上传/拖入的参考图）。额外有 `src`、`fit`（contain/cover/fill）。**无生成态**。
- **video** — 纯素材视频。额外有 `src`、`poster`、`fit`。**无生成态**。

### 3.2.1 生成单元（一等公民，P1 引入）

`ai-image` 与 `ai-video` 是本项目真正的主角。它们是**复合业务组件**——一个 node 渲染成一整套视觉（图/骨架屏/进度遮罩/prompt 摘要条/hover 操作条），但**整体只是一个 node**，见 §2.2。

```ts
interface AiGeneratedNode extends BaseNode {
  fwType: 'ai-image' | 'ai-video'

  // ── 生成生命周期 ──
  generationId: string | null
  status: 'empty' | 'pending' | 'running' | 'succeeded' | 'failed'
  errorMessage: string | null

  // ── 生成参数（原样留存，供用户查看与一键复跑）──
  prompt: string
  params: Record<string, unknown>   // 模型、尺寸、时长、种子等，形状由 provider 决定

  // ── 结果 ──
  src: string | null
  poster: string | null             // 仅 ai-video

  fit: ObjectFit
}
```

**每个 status 都必须有明确的视觉**，且两个渲染器都要实现：

| status | 该画成什么 |
|---|---|
| `empty` | 空占位框 + 「点击生成」提示 |
| `pending` / `running` | 骨架屏 + 进度指示（不要只显示 spinner，要占住最终尺寸避免跳动） |
| `succeeded` | 图片 / 视频首帧 + 底部 prompt 摘要条 |
| `failed` | 错误占位 + `errorMessage` + 「重试」入口 |

**参数原样留存**是硬要求：用户要能看到「这张图当时用什么参数生成的」并一键复跑。见 §4。

### 3.2.2 溯源关系（`sourceFwIds`）

用户 2026-08-03 澄清：*「是无限画布，只不过这个连线是——比如图片后面出 abc 版本三个视频，那么连线就是说这三个视频的来源都是这张图片。」*

**连线 = 派生自，是溯源记录，不是执行流。** 它**不需要独立的 Edge 实体**，一个字段就够：

```ts
interface AiGeneratedNode extends BaseNode {
  // ...（见 §3.2.1）

  /**
   * 来源节点的 fwId 列表：本节点由这些节点派生而来。
   * 空数组 = 无来源（纯文生图 / 文生视频，或用户直接上传）。
   */
  sourceFwIds: string[]
}
```

#### 规则

1. **只有生成单元有 `sourceFwIds`**。`frame` / `box` / `img` / `video` 没有——它们不是被生成出来的。
2. **有向、可多对多**：一个节点可以有多个来源（图 + 参考图），一个来源也可以派生出多个结果（图 → A/B/C 三个视频）。
3. **不允许成环**。派生关系天然无环；若将来开放手动连线，创建时必须校验。
4. **连线不是 node**——它没有 `x/y/width/height`，不进 node 树，不可单独选中（P1 只渲染）。位置由两端节点的几何算出来。
5. **离群节点** = 生成单元中 `sourceFwIds` 为空、且没有任何节点的 `sourceFwIds` 包含它。

#### 悬空引用（必须处理，容易漏）

源节点被删除时，把它的 `fwId` 从所有引用者的 `sourceFwIds` 里移除，连线随之消失。**不级联删除派生节点**——那三个视频本身是有价值的产物，不该因为删了参考图而消失。

⚠️ **这给撤销带来一个隐蔽要求**：删除操作必须**同时记录被清理掉的那些引用**，否则撤销删除时连线恢复不回来。落地形态见 §4.5 的 `InboundRef` —— **`add-node` 与 `remove-node` 对称持有 `inboundRefs`**。

> **这里 2026-08-04 改过一次，原设计不闭环。**
>
> 初版只给 `remove-node` 加了 `detachedRefs`。Codex 实现 `U1a` 时先写红测，发现 §4.5 那句「**每个 op 自带反推逆操作所需的全部信息**」**在 remove 上根本不成立**——`remove-node` 的逆是 `add-node`，而 `add-node` 没有这个字段，**信息必然丢失**，`applyOp(invertOp(removeOp))` 恢复不了连线，round-trip 测试过不去。它按纪律停下上报，没擅自扩类型。
>
> **为什么改成对称持有，而不是给 `add-node` 加一个可选字段**（Codex 提的是后者）：`add-node` 与 `remove-node` **本来就是同一个操作的两个方向**。「只在它作为逆操作时才有意义」的字段是设计气味；而「一个节点的入边引用清单」对两个方向**都是真实语义**——remove 时摘除、add 时恢复、新建时为空。对称之后 `invertOp` 退化成纯粹的 kind 翻转，零信息丢失。
>
> 名字也从 `detachedRefs` 改成方向中性的 `inboundRefs`——前者只在 remove 方向读得通。

#### 为什么这个方案够用

| | 执行流节点图（初版误读） | 溯源关系（实际需求） |
|---|---|---|
| 需要的模型 | 独立 Edge 实体、端口类型、拓扑排序、环检测、执行引擎 | **一个 `string[]` 字段** |
| 持久化 | 单独一张 edge 表 | 随 node 一起走 |
| 撤销 | 边的增删改要进操作集 | 只需在 `remove-node` 里多记一项 |
| 渲染 | 需要边的命中测试与选中态 | 只画不选 |

成本差一个数量级。**先做这个轻量版**，等真出现「需要给边本身挂属性」的需求再谈升级。

### 3.3 规则

1. **坐标是相对父节点的**，不是画布绝对坐标。渲染器负责逐层累加。
2. **只有 frame 能有子节点。** box/img/video 是叶子。
3. **布局起步用绝对定位**（x/y/width/height 直接生效），**不引入自动布局引擎**。yoga 之类是明确的后续开环，不进第一版——引入它会同时改变两个渲染器的实现难度，必须等选型结论出来后再评估。
4. **兄弟节点的数组顺序即 z 序**，数组靠后的画在上面。不设独立 `zIndex` 字段（两份真相必然漂移）。
5. **schema 只有一份真相源** = `packages/core/src/node-schema.ts`。类型定义、字段名常量、类型守卫、默认值全在这一个文件里；两个渲染器与 `server-core` 都从它导入，谁都不能私自扩字段。
6. **node 树不含任何渲染器专有字段**。没有 `leaferId`、没有 `domRef`。渲染器需要的内部映射自己在内存里维护，`destroy()` 时丢弃。
7. **🔴 禁止把 node 对象整体展开进渲染器节点。** 不允许 `Object.assign(leaferNode, node)`、`new Rect({ ...node })`、`<div {...node}>` 这类写法，**必须逐字段显式映射**：

   ```ts
   // ❌ 危险：node 的字段会静默覆盖 Leafer 的同名属性，且新增字段会悄悄泄漏进去
   const rect = new Rect({ ...node })

   // ✅ 显式映射：加了字段不会自动流进渲染器，改名会当场编译报错
   const rect = new Rect({
     x: node.x, y: node.y,
     width: node.width, height: node.height,
     fill: node.fill,
   })
   ```

   **理由**：`x` `y` `width` `height` `rotation` `opacity` `visible` `name` `children` 在 LeaferJS 上全部同名。整体展开一旦写下，语义冲突会以「莫名其妙渲染不对」的形式出现，而且两个渲染器的表现还不一样——那正是最难查的一类 bug。逐字段映射看着啰嗦，但它把冲突从运行时挪到了编译期。

### 3.4 状态分层

| 层 | 内容 | 持久化 | 切换渲染器时 |
|---|---|---|---|
| **Document 状态** | node 树 | ✅ 存后端 | 保留 |
| **会话状态** | 视口、选中集、悬停、编辑中的输入 | ❌ 不存 | **必须保留** |
| **渲染器内部状态** | DOM 引用、Leafer 实例、动画句柄、离屏缓存 | ❌ | 丢弃（`destroy()` 清干净） |

中间那层最容易写错——它「感觉像 UI 状态」所以容易被随手塞进渲染器，但一切换就丢，用户会当成 bug。

## 4. Generation（生成任务）

| 字段 | 说明 |
|---|---|
| `id` | 任务 id |
| `status` | `pending` / `running` / `succeeded` / `failed` |
| `kind` | `text-to-image` / `image-to-image` / `text-to-video` / ... |
| `params` | 提交时的参数（prompt、尺寸、时长等），原样留存以便复现 |
| `result` | 成功时的素材 URL 列表 |
| `error` | 失败原因 |

规则：

- **生成是异步的**——提交返回任务 id，前端轮询或订阅状态，不假设同步返回结果。
- **参数原样留存**。用户要能看到「这张图当时是用什么参数生成的」并一键复跑。
- **Provider 可替换**。`core` 只认 Provider 接口，不认任何具体厂商。仓内默认是返回占位素材的 mock provider。

## 4.5 撤销历史（持久化，以 documentId 为键）

**撤销历史存后端，不是内存。** 关掉页面第二天打开，仍然能撤销——对「误删了一张昨天生成的图」这个真实场景，内存内 undo 是没用的。

### 存什么

**存操作日志，不存整树快照。** 快照方案每步存一棵完整的树，几百步就是几十 MB；本项目的操作又是低频的（摆放和生成，不是设计器那种每秒几十次属性微调），日志方案的体积优势明显且实现不复杂。

```ts
interface NodeSlot {
  parentFwId: string
  index: number      // 在父节点 children 里的位置，即 z 序
  x: number
  y: number
}

/**
 * 「其它节点的 sourceFwIds 中指向本节点」的引用位置。
 * remove 时这些引用被摘除，add 时按原位恢复；新建节点时为空数组。
 */
interface InboundRef {
  fwId: string        // 引用方节点
  index: number       // 在其 sourceFwIds 数组里的位置
  targetFwId: string  // 被引用的节点 —— 可能是被删节点本身，也可能是它的后代
}

type CanvasOp =
  | { kind: 'add-node';    slot: NodeSlot; node: CanvasNode; inboundRefs: readonly InboundRef[] }
  | { kind: 'remove-node'; slot: NodeSlot; node: CanvasNode; inboundRefs: readonly InboundRef[] }
  | { kind: 'move-node';   fwId: string; from: NodeSlot; to: NodeSlot }
  | { kind: 'update-node'; fwId: string; before: Partial<CanvasNode>; after: Partial<CanvasNode> }
  /** 一次用户手势产生的多个操作，**作为一个整体撤销**。禁止嵌套。 */
  | { kind: 'batch';       ops: readonly CanvasOp[] }

interface HistoryEntry {
  id: string
  documentId: string   // ← 以画布 id 为键
  seq: number          // document 内单调递增
  op: CanvasOp
  createdAt: string
}
```

**关键性质：每个 op 自带反推逆操作所需的全部信息**，因此不需要另存一份 inverse。

> ⚠️ **这句话已经被打脸两次，两次都是 Codex 在实现时发现的。** 记在这里提醒后来者：**「自带全部信息」是个需要逐个 op 验证的断言，不是写下来就成立的。**
>
> **第一次（`inboundRefs` 不对称）**：`remove-node` 带了引用清单，逆操作 `add-node` 却没有该字段 → 信息丢失，撤销删除时连线恢复不回来。已改为 add/remove 对称持有。
>
> **第二次（`InboundRef` 缺被引用目标）**：原设计隐含假设「所有 inboundRef 都指向被删节点本身」。但**删除一个 frame 时，外部节点可能引用的是它的后代**——一个 `remove-node` 无法表达「每条入边具体指向哪个后代」，于是**「清除悬空引用」与「无损 undo」不能同时满足**。已加 `targetFwId` 字段。

### `batch` —— 一次手势 = 一次撤销

**问题**：`onNodesMove` / `onNodesResize` / `onNodesDelete` 的参数都是数组。用户一次拖动三个节点会产生三个 `CanvasOp`，线性栈会让 `Ctrl+Z` **逐个撤销**——用户按了一次却只回退了三分之一，明显不符合预期。

**裁定**：加 `{ kind: 'batch'; ops: readonly CanvasOp[] }`。

- `applyOp(batch)` 按顺序应用；`invertOp(batch)` = **ops 反序 + 每个取逆**（顺序必须反，否则依赖关系错乱）
- **禁止嵌套**：`batch.ops` 里不许再出现 `batch`。一次手势只有一层
- 选它而不是「把栈条目改成 `CanvasOp[]`」的理由：**`HistoryEntry` 的形状不变**（仍是一条记录一个 `op`），持久化层零改动；且 `invertOp` 保持全函数——每个 op 都有逆

| op | 逆操作 |
|---|---|
| `add-node` | 用同一个 `slot` 做 `remove-node` |
| `remove-node` | 用同一个 `slot` 和 `node` 做 `add-node` |
| `move-node` | `from` 与 `to` 对调 |
| `update-node` | `before` 与 `after` 对调 |

### 怎么存怎么读

两张表，**都以 `documentId` 为键**：

| 表 | 存什么 | 为什么 |
|---|---|---|
| `Document` | **当前**的完整 node 树 + `historySeq` | 打开画布时一次读到位，不需要从头重放 |
| `HistoryEntry` | 操作日志 | 撤销 / 重做用 |

- **撤销** = 取 `seq === historySeq` 那条，应用其逆操作，`historySeq--`，写回 Document
- **重做** = `historySeq++`，取该条正向应用，写回 Document
- **产生新操作时**，丢弃 `seq > historySeq` 的条目（不做分支历史——那是另一个量级的复杂度，且业务上没人要）

### 必须配套的裁剪策略

日志会无限增长，**必须裁**：每个 document 只保留最近 **200** 条，写入时把更早的删掉。理由是本项目操作低频，200 步足够覆盖「昨天那张图」这类场景；不设上限迟早撑爆表。

### 范围

**这属于 P1（骨架贯通）**，P0 无交互所以没有撤销。P0 只需保证 node 树是唯一真相源、变更都经应用层——那是撤销能成立的前提。

## 5. 明确不做

判据是 `AGENTS.md` §1.1 的主要矛盾：**服务「生成 → 摆放 → 再生成」循环的才做，服务「把图形调得更好看」的不做。**

### 5.1 永久不做（属于通用设计器，不是本项目）

这一类不是「以后再说」，是**方向上就不属于这个项目**：

- **精细属性编辑面板**（描边、渐变、阴影、混合模式、逐项数值微调）
- 路径 / 钢笔 / 布尔运算 / 矢量编辑
- 文本富样式（字重字距行高、文字排版、艺术字）
- 对齐分布、智能参考线的全套设计器交互
- 组件 / 变体 / 样式库 / 设计系统
- 深度图层管理（多层嵌套分组、图层样式、蒙版）

> **`box` 的属性刻意保持最小**（只有 `fill` 与 `cornerRadius`），就是为了不给这类功能留生长点。它是**几何对照的测试载体**，不是产品元素。

### 5.2 暂不做（方向上属于本项目，但不进第一版）

- 多人实时协作 / CRDT
- 自动布局引擎（yoga / flexbox 语义）
- 分支历史（撤销后又产生新操作时，被丢弃的重做分支不保留）
- 跨端并发编辑同一 document 的冲突合并
- 权限、分享、评论
- 素材库 / 资产管理
- 多页面 / 多画板
