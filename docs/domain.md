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
| **Document（文档）** | 一个画布工作台的完整内容，对应一棵 node 树的根。用户打开的「一个项目/一张画布」就是一个 Document。 |
| **Node（节点）** | 画布上的一个元素。所有可见内容都是 node。 |
| **Node 树** | Document 的全部 node 按父子关系组成的树。**是唯一真相源**——渲染、持久化、协作、撤销重做全部基于它。 |
| **Renderer（渲染器）** | 把 node 树画到屏幕上的实现。本项目并行两套：`renderer-dom` 与 `renderer-leafer`。 |
| **Provider（生成方）** | AI 生成能力的提供方抽象。输入生成参数，输出素材 URL。仓内只有 mock 实现。 |
| **Generation（生成任务）** | 一次 AI 调用的生命周期：提交 → 排队/进行中 → 成功（产出素材）或失败。 |

## 3. Node 模型

### 3.1 通用字段

每个 node 都有：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `string` | 文档内唯一，创建时生成，永不复用 |
| `type` | `'frame' \| 'box' \| 'img' \| 'video'` | 判别字段，决定其余字段形状 |
| `name` | `string` | 用户可见名称，图层面板显示用 |
| `x` `y` | `number` | 相对**父节点**左上角的偏移 |
| `width` `height` | `number` | 尺寸 |
| `rotation` | `number` | 旋转角度（度） |
| `opacity` | `number` | 0–1 |
| `visible` | `boolean` | 是否渲染 |
| `locked` | `boolean` | 锁定后不可选中拖动 |
| `children` | `Node[]` | 仅 `frame` 有；其余类型无此字段 |

### 3.2 各类型专有字段

- **frame** — 容器。可嵌套任意类型（含 frame 自身）。额外有 `clip: boolean`（是否裁剪超出边界的子节点）、`background`。
- **box** — 纯图形块（矩形起步）。额外有 `fill`、`cornerRadius`、`stroke`。
- **img** — 图片。额外有 `src`、`fit`（contain/cover/fill）、`generation?`（若由 AI 生成，指向对应 Generation 记录）。
- **video** — 视频。额外有 `src`、`poster`、`fit`、`generation?`。

### 3.3 规则

1. **坐标是相对父节点的**，不是画布绝对坐标。渲染器负责逐层累加。
2. **只有 frame 能有子节点。** box/img/video 是叶子。
3. **布局起步用绝对定位**（x/y/width/height 直接生效），**不引入自动布局引擎**。yoga 之类是明确的后续开环，不进第一版——引入它会同时改变两个渲染器的实现难度，必须等选型结论出来后再评估。
4. **兄弟节点的数组顺序即 z 序**，数组靠后的画在上面。不设独立 `zIndex` 字段（两份真相必然漂移）。
5. **schema 只有一份真相源**，定义在 `@framewright/core`。两个渲染器都从它导入类型，谁都不能私自扩字段。

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

## 5. 明确不做（第一版）

以下都是画布产品的常见功能，但**第一版一律不做**，避免战线拉长：

- 多人实时协作 / CRDT
- 自动布局引擎（yoga / flexbox 语义）
- 无限撤销重做的完整历史（先只做内存内简单 undo）
- 权限、分享、评论
- 素材库 / 资产管理
- 除矩形外的复杂图形（路径、文本富样式）
