# backend-domain — 后端领域模型

> Project / Session / Asset 三块。node 树与撤销历史见 `docs/domain.md`，本文件不重复。
> 建立日期：2026-08-04。**这是设计，尚未实现**——实现任务见任务板波次 8。

---

## 1. 实体全景

```
Project (projectId)                      一个创作项目，如「花果山」
├── Document (documentId)  1:N           项目下的画布，如「万魂归墟 预告片」
│   └── nodeTree + historyEntries        见 docs/domain.md
├── Session (sessionId)    1:N           一条 AI 对话线
│   └── Message            1:N           对话消息，可触发生成
└── Asset (assetId)        1:N           素材文件（上传的 + 生成的）
```

**为什么 Project 与 Document 分开**：一个创作项目通常有多个画布（分镜一、分镜二、预告片），它们共享素材库和对话上下文。对标产品的面包屑就是两级。

**为什么 Session 挂在 Project 而不是 Document**：用户的对话是围绕「这个项目」展开的，可能在多个画布间穿梭；把对话绑死在单个画布上会割裂上下文。

## 2. Project

```ts
interface Project {
  id: string
  name: string
  description: string | null
  coverAssetId: string | null    // 项目封面，通常取某个生成结果
  createdAt: string
  updatedAt: string
}
```

**查询入口**：`projectId` 是一切的顶层键。给定 `projectId` 能查到：它的全部画布、全部对话、全部素材。

## 3. Session 与 Message —— 对话与回溯

```ts
interface Session {
  id: string
  projectId: string
  title: string                  // 首条用户消息的摘要，可改
  createdAt: string
  updatedAt: string
}

type MessageRole = 'user' | 'assistant' | 'system'

interface Message {
  id: string
  sessionId: string
  seq: number                    // session 内单调递增，保证顺序
  role: MessageRole
  content: string

  /** 🔴 回溯锚点：这条消息触发/产出了什么 */
  generationIds: readonly string[]   // 它发起的生成任务
  nodeFwIds: readonly string[]       // 它在画布上产生的节点
  documentId: string | null          // 当时用户在哪个画布上

  createdAt: string
}
```

### 🔴 「回溯到那条对话记录」怎么实现

用户在画布上看到一个生成结果，想知道「这是哪次对话生成的」。**双向可查**：

| 方向 | 怎么查 |
|---|---|
| 消息 → 产物 | `Message.generationIds` / `Message.nodeFwIds` |
| **产物 → 消息** | 节点上存 `originMessageId`（见下） |

因此 `AiGeneratedNode` 需要扩一个字段：

```ts
interface AiGeneratedNode {
  // ...（见 domain.md §3.2.1）
  /** 产生本节点的那条对话消息。用户直接点「生成」而非经对话时为 null。 */
  originMessageId: string | null
}
```

**为什么两边都存而不只存一边**：单向存的话，另一个方向要全表扫。这是刻意的冗余，**代价是写入时要同步维护两处**——写进实现任务的验收里。

## 4. Asset —— 素材文件

```ts
type AssetKind = 'image' | 'video' | 'audio'
type AssetOrigin = 'upload' | 'generated'

interface Asset {
  id: string
  projectId: string
  kind: AssetKind
  origin: AssetOrigin

  /** 存储位置。本地开发是相对路径，生产是对象存储 key */
  storageKey: string
  mimeType: string
  byteSize: number

  width: number | null           // 图片/视频的像素尺寸
  height: number | null
  durationMs: number | null      // 仅视频/音频

  /** 生成而来的素材指回它的生成任务 */
  generationId: string | null

  createdAt: string
}
```

### 存储抽象

**`server-core` 只认一个 `AssetStorage` 接口，不认具体实现**——同 `provider` 的处理：

```ts
interface AssetStorage {
  put(key: string, data: Uint8Array, mimeType: string): Promise<void>
  getUrl(key: string): Promise<string>       // 可能是本地 URL，也可能是签名 URL
  delete(key: string): Promise<void>
}
```

| 环境 | 实现 |
|---|---|
| 本地开发 | 写 `.data/assets/`，`getUrl` 返回 `/api/assets/[id]` 走 Route Handler 读文件 |
| 生产 | 对象存储，`getUrl` 返回签名 URL |

**本地实现先做，生产实现留空**——`AGENTS.md` §2 的硬约束要求 provider 与存储都可替换，且仓内只保留中立实现。

## 5. Generation —— 与 Session、Asset 的连接点

`domain.md` §4 已定义 `Generation` 的生命周期。补充它与本文件三个实体的关系：

```ts
interface Generation {
  id: string
  projectId: string
  documentId: string
  /** 经对话发起时有值，直接点节点上的「生成」时为 null */
  sessionId: string | null
  messageId: string | null

  status: 'pending' | 'running' | 'succeeded' | 'failed'
  kind: 'text-to-image' | 'image-to-image' | 'text-to-video' | 'image-to-video'
  params: Record<string, unknown>     // 原样留存，供复跑

  /** 输入素材（图生图/图生视频的参考图） */
  inputAssetIds: readonly string[]
  /** 产出素材 */
  outputAssetIds: readonly string[]

  errorMessage: string | null
  createdAt: string
  finishedAt: string | null
}
```

**这张表是整个系统的枢纽**——它同时连着对话（`messageId`）、画布（`documentId` + 产出的节点）、素材（`inputAssetIds` / `outputAssetIds`）。「回溯」的每一条路径都经过它。

## 6. LLM 的位置

对话里的 LLM 有两个职责，**不要混为一谈**：

| 职责 | 说明 | 输出 |
|---|---|---|
| **对话** | 回答用户、帮助构思分镜 | 文本消息 |
| **🔴 意图转生成参数** | 把「给我来三个不同氛围的版本」翻译成三次结构化的生成调用 | `Generation.params` |

**第二个才是产品价值所在**——用户不必手填 prompt / 模型 / 尺寸 / 时长，说人话即可。

**接口抽象**（同 provider 处理，仓内只保留 mock）：

```ts
interface LlmProvider {
  chat(messages: readonly Message[], opts): AsyncIterable<string>   // 流式文本
  planGenerations(messages: readonly Message[], context): Promise<GenerationPlan[]>
}

interface GenerationPlan {
  kind: Generation['kind']
  params: Record<string, unknown>
  inputAssetIds: readonly string[]
  /** 给用户看的一句话说明，如「1K 竖版，赛博朋克氛围」 */
  summary: string
}
```

⚠️ **`planGenerations` 必须返回结构化计划、由用户确认后才执行**，不许 LLM 直接触发花钱的生成。这条是产品安全底线。

## 7. 数据库表（Prisma）

在 F1 已建的 `Document` / `HistoryEntry` 之外新增：

| 表 | 主键 | 关键索引 |
|---|---|---|
| `Project` | `id` | — |
| `Session` | `id` | `projectId` |
| `Message` | `id` | `(sessionId, seq)` 复合唯一 |
| `Asset` | `id` | `projectId`、`generationId` |
| `Generation` | `id` | `projectId`、`documentId`、`messageId` |

`Document` 需加 `projectId` 外键。

## 8. 明确不做（第一版）

- 多人协作 / 权限 / 分享
- 素材去重（同一张图上传两次存两份）
- 对话的分支（编辑历史消息重新生成）
- 全文搜索
- 素材的版本管理

---

## 附录 · composition root 归属（2026-08-05 裁定）

### 问题

执行方补生成 Route Handler 时被卡住，上报的诊断很准：

> 「实际缺的是 **composition root**，而不只是一个普通 re-export」

`server-core` 只导出工厂 `createGenerationService(deps)`，没有组装好的实例；
而 `apps/web` 不依赖 `provider`。于是 Route Handler 无路可走 ——
要么在路由里自己拼装 provider/store/storage/Prisma（违反「路由里不写业务、不碰 Prisma」），
要么放弃。它选择停下上报，**这是对的**。

### 裁定：composition root 归 `server-core`

**理由**：其它 store（document / session / asset）都已经是这个形态 ——
模块内建默认单例，对外导出组装好的函数（`getDocument` 而不是 `createDocumentStore(prisma)`）。
生成服务没有跟上，只是因为它多一个 provider 依赖。

**做法**：

1. `packages/server-core` 增加对 `@framewright/provider` 的 workspace 依赖
2. 在 `server-core` 内组装默认生成服务，导出 `submitGeneration` / `pollGeneration`
3. `createGenerationService(deps)` **保留**，供测试与将来替换 provider 用

**这不违反「provider 必须可替换」**（`AGENTS.md` §2）：可替换指的是**接口可换实现**，
而不是「不许有默认实现」。默认走 mock，换真实厂商时只动这一个组装点 ——
反而比让每个调用方各自组装更容易换。

### 连带裁定：`server-core` 的错误要机器可判定

执行方还报了一条：`pollGeneration` 对不存在的记录只抛普通 `Error`，
路由**没有稳定错误码可映射成 404**，只能一律 500。

**这是真缺陷**：HTTP 层无法区分「查不到」和「炸了」，
对调用方来说这两种情况的处置完全不同。

**要求**：`server-core` 抛的错要带机器可判定的 `code`。
口径参照 `provider` 已经做对的那个 —— `ProviderError` 带 `code: 'unknown-task'`。
路由据此把「查不到」映射成 404。
