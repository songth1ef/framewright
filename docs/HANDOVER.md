# framewright 交接说明

> 写给接手继续开发的人（含 AI agent）。
> 最后更新：2026-08-07，对应提交 `f24eb62`。
> **先读这一份，再按需展开下面链接的文档。**

---

## 0. 三十秒了解现状

| 项 | 状态 |
|---|---|
| `tsc --build` | 0 error |
| 全量单测 | **130 文件 / 886 条全绿** |
| 测试发现门禁 | 全覆盖（`tools/` 已纳入扫描根）|
| 生产构建 | ✅ **已进门禁**（`next build` 的类型检查比 tsc 严，会拒未使用的 import）|
| 全量 e2e | **44 条全绿** |
| 默认渲染器 | **HTML / DOM**（2026-08-06 起，依据见性能报告）|
| 部署 | ✅ **已上线** https://framewright-ashen.vercel.app（Vercel + Turso）|

> ⚠️ `pnpm verify` 现在是**五关**：typecheck / 发现门禁 / 单测 / **生产构建** / e2e。
> 加 build 的原因见 §7.4。

**全新机器第一步**：`pnpm setup`（生成 Prisma Client + 建库 + 装 Playwright 浏览器）。
不跑它，`pnpm verify` 会连挂三次且报错都指不到「你少了准备步骤」上。

跑起来：`pnpm dev` → http://localhost:3100

线上：
- 画布 https://framewright-ashen.vercel.app
- **统一设置中心** https://framewright-ashen.vercel.app/settings
- **React Flow 只读预览** `/compare/reactflow/<documentId>`（实验性，无交互）

---

## 1. 这是什么项目

AI 图像/视频生成画布工作台，对标 liblib canvas / 即梦 / Krea。
**个人作品 + 技术预研**，可开源。

核心技术命题：**同一套画布业务逻辑，能否在多个渲染器实现上可插拔切换**，
并用实测数据回答"该选哪个"。

目前有两个完整实现（DOM、LeaferJS）+ 一个探针（React Flow）。

### 铁律（违反会被打回）
1. **状态不许存在渲染器内部** —— 会话状态归 host，切换渲染器时原样传给新渲染器
2. **`tsc --build` 必须 0 error** —— 只跑 vitest 不算数（出过"72 条测试全绿而 tsc 报 9 个 possibly undefined"）
3. **绿色不构成证据** —— 性能数字必须附"确实在干活"的旁证（画面指纹变化、实际渲染数量）
4. **单次采样不算数** —— 已实测出系统性偏差：16 个单次采样值**全部低于**中位数
5. **仓库要脱敏与作者公司相关的一切内容**，只用公开素材

---

## 2. 仓库结构

```
packages/
  core/              渲染器无关的业务核心：node schema、CanvasOp、视口裁剪、LOD、夹具、素材、
                     performance-profile（画质档案+设备检测）、compressed-json（大请求体 gzip）、
                     local-document-store（OPFS 三级落盘，核心层已就绪、尚未接进画布）
  renderer-dom/      DOM 渲染器 + 浏览器探针
  renderer-leafer/   LeaferJS 渲染器 + 浏览器探针
  renderer-reactflow/ React Flow 探针（仅调研，未成为可选渲染器）
  server-core/       Prisma client、后端领域逻辑
  provider/          生成 provider（目前是 mock）
apps/web/            Next.js 应用（App Router + Route Handlers）
e2e/                 Playwright
prisma/              schema + migrations（SQLite）
docs/                架构、报告、部署
tools/               Prisma 包装器、测试发现门禁、录制脚本、
                     turso-migrate（Turso 迁移+漂移检测）、
                     benchmark（统一基准）、benchmark-report（三方对照 Markdown）
```

### 关键契约
`RendererAdapter`：`mount / update / destroy / getRenderedBounds / getVisibleNodeIds`

`RenderContext`：`{ root, selection, viewport, callbacks, interactionMode?, viewportSize?, connectionVisibility?, cullingLimits? }`

**扩展 `RenderContext` 是已被批准的既有通道** —— `viewportSize`、`interactionMode`、
`connectionVisibility`、`cullingLimits` 都是这么进来的。需要给渲染器传新的会话状态时照此办理，
**不要新开机制，更不要用 core 模块级可变全局**（违反状态归属 + 多实例不安全）。

⚠️ 新增契约字段的缺省值必须**在没人传的时候就是对的**，要走显式 resolve 函数，
并**为"不传时用默认值"单独写测试**。`interactionMode` 就在这上面栽过：
直接写 `=== 'unified'` 导致 `undefined` 落进 native 分支，而契约文档写的缺省是 unified。

---

## 3. 常用命令

```bash
pnpm setup              # 🔴 全新机器第一步：生成 Prisma Client + 建库 + 装 Playwright 浏览器
                        #    与 .github/workflows/deploy.yml 的准备步骤逐条对齐。
                        #    不跑它，verify 会连挂三次，且报错都指不到「你少了准备步骤」上
pnpm dev                # 开发服务器，端口 3100

# 开着 dev（3100）时要跑 e2e，换端口，不要去杀 dev
FRAMEWRIGHT_E2E_PORT=3200 pnpm e2e
pnpm typecheck          # tsc --build --force
pnpm test               # 全量单测
pnpm test:discovery     # 测试发现门禁（防止新测试文件不被 vitest 发现）
pnpm e2e                # 全量 Playwright
pnpm verify             # 以上四项串起来跑（部署门禁用的就是这套）

# 性能探针（每档 5 次取中位数，结果写入 probes/results/）
node packages/renderer-dom/probes/run-zoom-out.mjs
node packages/renderer-leafer/probes/run-zoom-out.mjs

# 录交互演示 GIF（Playwright 录制，操作序列确定可复现）
node tools/record-canvas-demo.mjs <docId> "HTML / DOM" tools/recordings pan-zoom
node tools/record-canvas-demo.mjs <docId> "HTML / DOM" tools/recordings zoom-out-fast
```

---

## 4. 🔴 未完成的任务（接手就从这里开始）

### 4.1 进行中：图片请求分辨率自适应（最高优先级）

**背景**：素材真实分辨率高达 4000×3200，而节点格子只有 480×300。
原实现固定请求 960×600，但缩放上限已提到 800% —— 放大后是 4 倍拉伸，明显发糊。

**已落地**（提交 `a48a114` / `7bb9c64` / `7c37a0f` / `7fb1830` / `ca1ad2b`）：
- 按可见视口封顶的档位选择
- 换档预加载后原子接管（不闪白）
- 像素预算断言：三个缩放档总请求像素 **2,160,000 / 1,821,948 / 1,788,628**，
  最大/最小 < 1.21 倍 —— 修正后的模型成立
- 视口尺寸为 0 的崩溃修复

**✅ 2026-08-07 已收尾**（`10a28d5` / `f24eb62`，详见 `architecture.md` §8.8.4）：
- **迟滞已完整落地**，并补了三条**序列级**用例。此前只有单点断言 ——
  一个每次从头算的实现同样能通过，证明不了序列行为
- **800% 档发糊的根因找到并修复**：档位阶梯顶格是 8，而 800%×DPR2 需要 density 16，
  `requestScale = min(ceil(75×8), 800) = 600` 永远取不到 4K 素材对应的 800。
  补 16× 档后请求的就是原始尺寸（4000×3200）
- **代价已量化**：只在 800% 一档 +63.7% 请求像素，25%/100%/400% 三档零影响。
  用**请求像素**而非下载字节做指标 —— 后者被 picsum 延迟主导，噪声极大

**⚠️ 测量方法论上的坑（一定要读）**：
`picsum.photos` 的**首字节要 5.5–6.6 秒**，而 TCP 连接只要 1 毫秒 ——
这是它按需生成图片的服务端耗时，与图片大小几乎无关
（960×600 要 8.44s、3000×2000 要 10.57s）。

**所以"首屏耗时"这个指标被 picsum 延迟主导，不能用来衡量本项目的实现。**
早期有一版结论把"首屏 8090→5597ms"归因为解码成本下降，
**那个归因是过头的** —— 多半来自下载字节数（890KB→121KB）。
后续验收改用确定性指标：**请求像素总量、清晰度比值、下载字节数**。

### 4.2 待决策（需要人拍板，不要替他决定）
1. **demo 画布要不要挪出首页** —— 首页身兼二职（文档列表 + demo 画布宿主），
   列表变长会把画布挤下去，是 e2e 隔离问题的**根因**。现在靠 `e2e/reset-documents.ts`
   兜着，那是**权宜之计**。对照实验证实：`host-interaction` 单独跑 8/8 全过、全量跑失败 5 条。
2. ~~**飞书导入**~~ —— 用户 2026-08-06 决定不做，竞品调研留在本地 `docs/research/`
3. **小地图「增加内容」的具体所指** —— 用户提过但未展开，候选：当前视口框、点击/拖拽跳转
4. **`demo-document` 是否改尺寸** —— 它同时是**几何对照夹具**（文件头明写「输入不同，
   对照就没有意义」），几何基线快照由它生成。改尺寸要显式 `--update-snapshots` 并说明原因
5. **React Flow 是否升格为生产渲染器** —— 水印用户已确认接受（保留 attribution 本就
   完全合规，灰区只在「移除」这个动作上）。剩下的成本是**三版同步**：`AGENTS.md` 禁止
   「只在一个渲染器里实现某功能」，加到三个是每个功能写三遍

### 4.3 已知未闭合项
- **fan 模式 50% 档 44.75 fps，未达 60** —— 端点早退有效但不是全部答案
- **连线分档阈值 512 的推导过程未经复核** —— 执行方收尾前被中止，
  书面论证没留下，只有 11 份探针原始结果随提交入库。结果复核过（44/44 + 全量单测绿）
- **8K 素材实测返回 400，未收录** —— 如实标注，没有伪装成可用素材
- ~~**内存未测**~~ —— **2026-08-06 已可测**：CDP `SystemInfo.getProcessInfo` 取分进程 PID
  再用 `ps -o rss=` 读真实 RSS。实测对负载有反应（空页面 renderer 76MB → 压负载 233MB）。
  原判断「页面级 API 测不到」对**页面级 API** 成立，但换条路就能拿到。
  ⚠️ 仍有两条限制随数据一起记：headless 用 SwiftShader 软件光栅化，GPU 进程 RSS 不反映
  真实显存；RSS 含共享库开销，只做同档位前后差值
- **只测了 HeadlessChromium** —— 真机与 GPU 环境下 canvas 的合成路径未必被充分利用，
  DOM vs Leafer 的相对表现**可能不同**
- **画布 `dot` LOD 档位（scale<0.2）仍把节点降级成纯点** ——
  用户提过"一眼看出类型"的诉求，小地图那边做了，画布这边没做
- **LLM 接口只有设计，provider 仍是 mock**

---

## 5. 部署（✅ 已上线）

> **2026-08-06 首次实跑上线**：https://framewright-ashen.vercel.app
> Vercel + Turso 均已配好并验证（建文档 → 打开画布全通）。
> 下面这节记录方案与**首次实跑踩到的五个坑**——它们本地全都测不到。

### 首次上线踩到的五个坑（本地测不到，只有真实部署才暴露）

1. **Prisma Migrate 不支持 Turso** —— 校验 sqlite provider 的 URL 必须 `file:` 开头，
   `libsql://` 直接 P1012。已补 `tools/turso-migrate.mjs`（幂等 + 漂移检测 + `--baseline`）
2. **Vercel 检测不到 Next** —— monorepo 里 `next` 在 `apps/web`，而框架检测只看**根**
   `package.json`。已在根 devDeps 补声明
3. **`TURSO_AUTH_TOKEN` 是独立环境变量**，不从 URL query 取
4. **Prisma 的 `query_compiler_bg.wasm` 不进 tracing** —— 它不是静态 import，
   Next 看不见，serverless 里缺文件导致全站 500。已加 `outputFileTracingIncludes`
5. **`outputFileTracingIncludes` 的路径基准是 `next.config` 所在目录** —— 写错时
   **匹配到 0 个文件是完全静默的**，构建照常绿、线上报错和没加时一模一样

### 原方案说明

**GitHub Pages 发不了全栈**：项目有 10 个 API Route Handler + Prisma + better-sqlite3（原生 `.node`），
Pages 只托管静态文件。且 `output: 'export'` 会**直接 build 失败**（Route Handler 无法静态化）。

**已配好的方案**：push 到 main → GitHub Actions 跑门禁（tsc + 发现门禁 + 单测 + e2e）→ 全绿才部署 Vercel。
已核对无 `continue-on-error` / `if: always()`，**任何一关红都真正拦住**。

**数据库**：Vercel serverless 文件系统是临时的，SQLite 文件写进去下个请求就没了。
方案是**保持 `provider = "sqlite"` 不变**，生产走 libSQL（Turso）——
schema 里明确为 SQLite 做过取舍（无 enum、无标量数组，role/kind/status 存 String、数组存 Json），
换 Postgres 要重做全部 migrations，不值得。

`packages/server-core/src/prisma.ts` **按 URL 协议自动选 adapter**：
`file:` 走 better-sqlite3（本地开发 / e2e 零改动），`libsql:`/`https:` 走 Turso。
将来想换 Neon 也只动这一处。

**需要人配的 5 个 Secrets**：`VERCEL_TOKEN`、`VERCEL_ORG_ID`、`VERCEL_PROJECT_ID`、
`TURSO_DATABASE_URL`、`TURSO_AUTH_TOKEN`。步骤见 `docs/deploy.md`。

已验证：Linux Node 22 干净容器里 better-sqlite3 编译通过，`.node` 是 ELF x86-64，
Next trace 包含它与 libSQL adapter。

---

## 6. 必读文档

| 文档 | 内容 |
|---|---|
| `docs/architecture.md` | 架构、全部选型结论与实测数据。**§12 是视口裁剪的三次修正，含最重要的否定结论** |
| `docs/reports/2026-08-06-DOM-vs-LeaferJS-性能对比.md` | 完整性能对比。**开头三条"读数字之前必须知道的事"务必先读** |
| `docs/reports/2026-08-05-晨间汇报.md` | 按时间线的进展记录 |
| `docs/tasks/2026-08-05-夜间任务拆解.md` | 任务拆解与领地划分 |
| `docs/deploy.md` | 部署步骤 |
| `docs/lessons.md` | 踩过的坑 |

---

## 7. 踩过的坑（重复踩会浪费很多时间）

### 7.1 测试与验证
- **绿色不构成证据**：Leafer 视频探针曾给出 60/59.7/58.9 fps 的漂亮数字，
  但画面指纹全程不变、1/4/8 路内存完全相同 —— 数字是假的，什么都没渲染
- **假通过比报错危险**：`expect(locator).toHaveCount(0)` 在 Leafer 下**恒真**
  （canvas 没有 DOM 节点）。任何"断言某 DOM 元素不存在"的用例，必须先确认当前是 DOM 渲染器
- **墙钟阈值断言在并行套件里必然抖**。已把裁剪性能断言改成测**工作量**
  （遍历次数、比较次数、输出条数）—— 确定性的，同样能抓回归
- **会随机变红的守卫等于没有守卫**：它会训练所有人忽略红灯。
  修完抖动后必须**故意破坏产品代码确认测试会红**，再改回来
- **e2e 不许写死渲染器切换次数**。用 `e2e/renderer.ts` 的 `selectRenderer` 按标签循环。
  默认渲染器改过两次，第一次让十个 spec 集体挂掉（44 条 → 2 条）
- **渲染器选择不跨 `page.reload()` 保持**，每次 reload 后要重新 `selectRenderer`

### 7.2 契约与状态
- **"尚未测量"必须和"值算错了"区别对待**。ResizeObserver 在容器隐藏或首次布局前
  会**以 0×0 触发**，一律 assert 会让整个页面崩掉。这个坑踩过两次
  （`viewport-culling.ts` 的半退化视口 `a5caacb`、`demo-media.ts` 的视口封顶 `ca1ad2b`）
- **Leafer 探针在 800% 档必然失败（根因已查清，修复未成）**：
  三个节点规模全挂，报「首屏 10 帧后仍无 scale-node-0 像素」。
  实测：800% 下可视画布区只有 **120×163**，而 `scale-node-0` 在 `(40,40)` 尺寸 `450×300` ——
  **它铺满整个可视区，但中心点在屏幕坐标 `(2120,1520)`**，早已出界。
  而 `selectPaintableLeafId` 用的是**中心点判定**，因此筛不到任何节点。

  2026-08-07 试过改成「取节点与视口相交区域的中心」，逻辑上正确但**800% 档仍 timeout**，
  说明还有第二个原因（怀疑是 `ai-image` 的图片区在 10 帧≈167ms 内尚未下完 ——
  picsum 首字节 5.5~6.6 秒）。改动未被证明有效，已回退，**此项仍未解决**。

  ⚠️ **排查时的陷阱**：`--case=<id>` 子进程模式**不重新构建 bundle**，直接用现成产物。
  改了 `probes/browser/` 下的代码后用它诊断，跑的是旧代码 —— 本方在此浪费了三四轮。
  必须走完整入口（`--scenarios-file=...` 不带 `--case`）才会重建。

- **"已挂载"不等于"屏幕上看得见"**：挂载集合包含 overscan 区。
  Leafer 探针按"第一个已挂载节点"取证，节点在视口外时永远取不到像素，整个探针跑不起来

### 7.3 性能
- **一侧的优化收益不能外推到另一侧**：批量 path 对 DOM 有效（46.41→59.67），
  对 Leafer 是 **-50.4% 回归**（25% 档 15.47→7.67）。两个渲染器的性能模型是各自独立的
- **性能优化必须保留"无工作量"对照档**：10% 档两侧都没变化，
  是因为那一档 LOD 本就把连线整个裁掉了。没有这个对照就会把"本来没干活"误读成结论
- **上限只截输出不截工作量是常见陷阱**：`maxConnections` 原本只影响"最终渲染几条"，
  不影响"算了多少条" —— fanin 下全文档 1 万条线每次都物化+排序，最后才丢掉 9000 条

### 7.3.1 2026-08-07 新增的四条

- **仪表不对称造成的差距会被当成实现差距**：Leafer 探针此前一条图片下载数据都没采，
  于是「DOM 首屏 5–6 秒 vs Leafer 10–85ms」看着像 60 倍碾压。补上仪表后同档
  Leafer 首屏从 46~85ms 变成 243.4ms —— 不是变慢，是**之前压根没等图片**。
  → `architecture.md` 里所有引用首屏数字的结论，在两侧对称重跑前一律视为不可用
- **兜底会让配置错误静默失效**：React Flow 的 `preCull` 因探针没传 `viewportSize`
  而退化成 0×0，实现按「尚未测量」返回全量，**预裁剪无声失效**（表现是开了 preCull
  却挂载 1000 个）。那个兜底本身是对的，但开发期要留可观察痕迹
- **门禁对机器负载过敏 = 会随机变红的守卫**：本机 load 16 时 minimap 用例连续多轮
  稳定失败，我据「稳定复现」判成真回归 —— **该判据在负载持续偏高时不成立**。
  受控实验（30s 过 / 5s 挂 / 30s 过，代码零改动）证明是超时问题。
  修法是区分两类等待：就绪类（等导航、等 fetch）给 30s，业务断言保持 5s
- **描述问题的段落，修好后要就地标注结论**：§8.4 那段「保存请求排队重叠」早在
  `f9ada6d` 就修了，但原段落仍是未解决的口吻，导致本方据它论证 OPFS 的必要性 ——
  只在别处记「已修」，后来的人（包括 AI）读到原段落仍会当成待办

### 7.4 干净克隆专属的坑（2026-08-06 换机时暴露）

在跑过几十轮的机器上**全部不可见**，因为残留产物把它们盖住了。CI 反而撞不上——
`deploy.yml` 显式做了 generate / migrate / playwright install 三步准备，
**本地路径却指望 `globalSetup` 兜底**。两条路径的假设不一致，是这几个缺陷能长期潜伏的原因。

- **e2e 首次运行的先后死锁**：Playwright 先起 webServer 并等首页返回 2xx，
  而首页要查 `Document` 表；空库 500 → 等满 120s → **`globalSetup` 里建表那句永远轮不到跑**。
  已修：migrate 串到 `webServer.command` 前面。报错原文只说「webServer 超时」，指不到根因
- **`better-sqlite3` 根目录未声明**：`e2e/global-setup.ts` 在仓库根被执行并 import 它，
  但它只声明在 `apps/web`。严格 pnpm 布局下从根 resolve 不到。已修（同 `@prisma/client` 那次）
- **Playwright 浏览器版本**：缓存里有 chromium 不等于是对的那个版本。
  `@playwright/test@1.62.1` 要 `1234`，装着 `1223`/`1228` 会让 44 条全部 0ms 失败
- **排序次级键方向相反**：`[{ createdAt: 'desc' }, { id: 'asc' }]` 在时间戳打平时
  给出的正好是反序。快机器上同毫秒插入是常态 —— 该用例实测 10 次挂 9 次。
  已把 4 处次级键改为与主键同向（cuid v1 带时间戳前缀，字典序≈创建序，生产同样成立）

**教训**：`pnpm verify` 过去不是自包含的。现在有 `pnpm setup` 与之配对，
本地与 CI 走同一条路径。**新机器接手先跑 `pnpm setup`。**

### 7.5 工程环境
- **`git commit -- <具体路径>`**，新文件先 `git add`。
  **禁止 `git add .` 或裸 `git commit`** —— 有并行 agent 时会把别人未完成的改动扫进你的提交（真实发生过，9 个文件）
- **后台派发经常被环境中止**。应对方式：**一次一小步、做完就提交**，
  把中止从"全盘丢失"降级为"丢一小步"
- **Bash 工具里用 `cmd &` 放后台会秒退**（外层一返回子进程即被回收），
  codex 还会卡在 `Reading additional input from stdin`。要让工具托管前台进程并 `< /dev/null`
- **PowerShell**：`-replace` 无 count 参数、不支持 heredoc、`Set-Content -Encoding utf8` 会破坏文件、
  `2>&1` 对原生 exe 会把 stderr 包成 ErrorRecord。多行文本用 `Write` 工具或 `git commit -F <file>`
- **缩放要 Ctrl+滚轮**，裸滚轮是平移。而且 **Playwright 的 `mouse.wheel()` 不带修饰键状态** ——
  `keyboard.down('Control')` 无效，手工 dispatch 带 `ctrlKey` 的 WheelEvent 同样无效。
  用工具栏按钮（有 `aria-label`）才靠得住

---

## 8. 协作方式（如果你也用多 agent）

编排方负责**派活、裁决、验证**；执行方（Codex / Kimi）负责**写代码**。
沉淀在 `~/.claude/skills/orchestrate-agents/SKILL.md`。

要点：
- **按共享运行时状态划分领地**，不是按目录。同一文件的不同区域要排队，不能并行
- 派单里要写清**必须停下来报告的情况**，尤其"发现我的判断是错的"——
  执行方停下来报告"你的模型不成立"比硬凑一个好看的数字有价值得多（真实发生过，见 §4.1）
- **执行方的报告不是证据**，编排方必须自己复验。出过"执行方说修好了，实际全量 e2e 挂 12 条"
