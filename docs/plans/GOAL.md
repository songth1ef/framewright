# GOAL —— 自主执行目标与优先级

> 编排方（Claude）在 loop 模式下按本文件推进。**这是唯一的优先级真相源。**
> 建立：2026-08-04 夜。执行方：Codex（yolo）与 Kimi（yolo），验收：`codex-p-code-review`。

---

## 终局目标

**一个能真的用的 AI 图片/视频生成画布工作台**，并**用两个渲染器的实测数据回答「DOM 还是 LeaferJS」。**

## 🔴 排序原则（决定先做什么）

1. **先打通，再加功能。** 「两端都写了但没接上」比「没做」更糟——它消耗了成本却不产生价值
2. **先出结论，再堆完整度。** 能决定选型的实测优先于任何新功能
3. **先可见，再完善。** 用户能亲手验的东西优先

---

## 执行顺序（严格按此，不许跳）

### 🔴 G0 —— 打通持久化（一件事解锁一大片）

| # | 任务 | 归属 |
|---|---|---|
| G0-1 | **F6 防抖自动保存**：编辑后 800ms 防抖 `PUT /api/documents/[id]`，携带 `root` 与 `getHistorySeq()`；保存中/失败可见反馈，失败不静默 | Codex |
| G0-2 | e2e：新建画布 → 拖动 → **刷新 → 位置还在** → 删除 → 刷新 → 仍是删除后状态 → **刷新后 `Ctrl+Z` 仍能撤销** | Codex |

**为什么排第一**：`document.root` 目前只在「撤销后又产生新操作」这一条路径下才写回，平时编辑都不保存。**没有它，所有后端工作在应用里都体现不出来**（见 `docs/功能清单.md`）。

**完成判据**：跑起来刷新页面，内容真的还在。

### 🔧 G0-3 —— dev 调试面板（用户 2026-08-04 要求，紧随 F6）

| # | 任务 | 归属 |
|---|---|---|
| G0-3 | 开发态调试面板：选中节点的 JSON dump + **属性变更流水日志** | Codex |

**要什么**：

1. **选中节点的 JSON**——面板里显示当前选中节点的完整对象，可折叠、可一键复制
2. **属性变更日志**——每次变更打一行：`<fwId> · <字段> : <oldValue> → <newValue>`，带时间戳，可清空、可筛选 fwId
3. **仅开发态出现**（`process.env.NODE_ENV !== 'production'`），生产构建里不该有

**⭐ 实现要点：不要另建监听机制。**

我们已经有 `CanvasOp` 操作流了——**每个变更都经过它**，而 `update-node` 本身就带 `before` / `after`。所以：

- `update-node` → 逐字段 diff `before` vs `after`，直接得到「哪个字段从什么变成什么」
- `move-node` → 从 `from` / `to` 的 `NodeSlot` 得到位置变化
- `add-node` / `remove-node` → 记节点的增删
- `batch` → 展开成多行，标注属于同一次手势

**在 host 记录 `CanvasOp` 的那一处埋点即可**，不需要 Proxy、不需要 observer、不需要改 schema。

**为什么值得现在做**：本项目已经踩过好几个「静默失败」——连线被画布底色盖住（所有测试都绿）、17 条测试永远不跑、`document.root` 不保存。**这类问题的共同点是「没有可见的变更流」**。有了这个面板，下次再出现「明明改了但界面没动」或「界面动了但没存」，一眼就能看出是哪一环断的。

### 🔴 G1 —— 两个决定选型的实测

| # | 任务 | 归属 |
|---|---|---|
| G1-1 | **C3 视频播放器**：两侧各做能真播的视频节点（播放/暂停/进度条/时间/音量）。**要的是代价数据**：控件自绘了多少、多路同时播什么表现、有没有「其实叠了层 DOM」的让步 | Kimi（leafer）+ Codex（dom） |
| G1-2 | **R2 canvas 文本输入**：Leafer 侧实测能否做出可用的文本输入（含中文 IME）、要不要叠 DOM、叠了怎么跟画布平移缩放同步 | Kimi |

**为什么排第二**：开环 #9 + Excalidraw 六年未解的问题。**这两项的结论比帧率数字更能决定选型**，而且越早知道越省。

**完成判据**：`architecture.md` §8.2 成本表有两侧的真实耗时与让步记录。

### G2 —— 让画布活起来

| # | 任务 | 归属 |
|---|---|---|
| G2-1 | `packages/provider`：接口 + mock（可配延迟与失败率，提交→轮询→占位素材） | Kimi |
| G2-2 | `server-core` 生成任务编排 + `POST /api/generate`、`GET /api/generate/[taskId]` | Codex |
| G2-3 | host 接生成流程：`onNodeAction('generate')` → 四态在画布上**真实流转** | Codex |
| G2-4 | 生成参数面板（挂节点下方的浮层：prompt 输入、模型/尺寸/时长） | Codex |
| G2-5 | **派生生成**：选中一个 `ai-image` 生成 → 新节点自动建 `sourceFwIds` → **连线自动出现** | Kimi |

### G3 —— 后端领域补齐（含对话回溯）

| # | 任务 | 归属 |
|---|---|---|
| G3-1 | `server-core`：Project 存取 + Document 按 project 维度列举 | Codex |
| G3-2 | `server-core`：Session / Message 存取（`seq` 自增并发安全） | Kimi |
| G3-3 | **回溯双向索引**：`Message.generationIds`/`nodeFwIds` 正查 + 节点 `originMessageId` 反查。**测试必须证明两个方向都通** | Kimi |
| G3-4 | `Asset` 存取 + `AssetStorage` 接口（本地写 `.data/assets/`，生产实现留空） | Codex |
| G3-5 | Route Handlers：projects / sessions / messages / assets | Codex |

### G4 —— 体验打磨

| # | 任务 | 归属 |
|---|---|---|
| G4-1 | 工具栏 UI：缩放 `+`/`-`、适应画布、100%、当前比例、渲染器切换做成正式控件 | Codex |
| G4-2 | `Shift+1` 适应内容 / `Ctrl+0` 适应画布（`core.getContentBounds` 已就位） | Codex |
| G4-3 | 节点 hover 业务工具条（重生成 / 下载 / 删除） | Kimi |
| G4-4 | 空画布引导 + 快捷键帮助面板 | Codex |

### G5 —— 选型结论（阶段闸门）

| # | 任务 | 归属 |
|---|---|---|
| G5-1 | benchmark harness：**按真实负载**——N 张真实尺寸图 + M 路同时播放视频，测首屏耗时、拖拽帧率、缩放帧率、内存、bundle 体积 | Kimi |
| G5-2 | 两侧实现成本报告（第二轮，覆盖 G0–G4） | 两侧各一 |
| G5-3 | **选型结论初稿** | Claude |

---

## 每轮 loop 的动作

1. **收残留**：`git status` 有未提交改动 → 跑测试 → 绿则按路径 commit（**绝不 `-A`**）
2. **验状态**：`pnpm verify`；关键节点起 dev server 端到端点一遍
3. **推送**：未推送 ≥ 5 个就 push（不攒）
4. **派下一批**：按上面顺序，**一次只派一条链的一小批**（被杀时损失小）
5. **裁定**：执行方报的设计缺口，能自己定就定并落文档，属七类才升级给人
6. **更新汇报**：`docs/reports/2026-08-05-晨间汇报.md`

## 🔴 并行派发规则（2026-08-04 立，多路同时跑时适用）

**并行的约束不在文件路径，在共享运行时状态。** 我之前按「文件领地不重叠」推理然后翻车过一次——
Prisma client、SQLite 文件、迁移历史、`node_modules`、端口 3100 全是共享的，跟改哪个文件无关。

### 四样独占资源（同一时刻只能一个 agent 持有）

| 资源 | 谁会撞 | 规避 |
|---|---|---|
| **端口 3100** | 任何起 dev server 的 | 只给需要端到端验证的那一路 |
| **`prisma/dev.db` + migration** | 任何跑 DB 测试或迁移的 | 同一时刻只一个 agent 动 DB 层 |
| **`pnpm install` / lockfile / `node_modules`** | 任何加依赖或建新包的 | **编排方预建包骨架并预先 install**，执行方一律禁止装包 |
| **`.git/index.lock`** | 任何 commit 的 | 撞了等几秒重试，**绝不许删 lock 文件**——删别人正在用的锁会毁坏仓库状态 |

### 切分方法

**按 package 切领地**，每路一个包，并显式列出「不许碰」的包名（光说「只改自己的」不够，要点名）。

**共享文件要单独点名。** 典型：`packages/core/src/demo-document.ts` 两个渲染器都依赖，
两侧同做视频节点时都想往里加示例节点 → **由编排方统一加**，执行方各用自己的测试 fixture。

### 测试策略

并行时执行方只跑**自己包的 scoped 测试**（`pnpm vitest run packages/<x>`），不跑全量 `verify`——
4 路并发跑全量会互相拖垮，且会争 DB。全量 verify 由编排方在收编时跑一次。

### 执行方 CLI 备忘（实测，别再猜）

- **Codex**：`codex exec -C <dir> --dangerously-bypass-approvals-and-sandbox "<prompt>"`
- **Kimi**：`kimi -p "<prompt>"` —— **`-p` 不能和 `-y` / `--auto` 并用**（会直接 exit 1：
  `Cannot combine --prompt with --yolo`）。`-p` 本身就是非交互自主模式，不需要额外授权 flag。

## 🔴 硬约束（每次派发都要带）

- **同一时刻只允许一个 agent 动数据库层**（schema / migration / generate）
- `git add` **按路径，绝不 `-A`**
- **绝不 `git push`**（只有编排方推）
- 不许 `--no-verify`；不许改设计文档与任务板状态列
- 不许动 framewright 之外的任何目录
- **验证必须端到端**——单测在仓库根 cwd 下本来就绿，测不出运行环境相关的问题
- dev server 起之前先清 3100 端口

## 停下来问人的七类

产品语义/规格变更 · 阶段顺序或范围调整 · 引入新依赖 · **不可逆动作** · 两执行方冲突且都有据 · 设计文档有错 · 实测推翻既有结论

## 完成后

每完成一个 G 阶段，用 `codex-p-code-review` 对该阶段的改动做一次独立审查，问题记进汇报文档。
