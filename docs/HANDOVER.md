# framewright 交接说明

> 写给接手继续开发的人（含 AI agent）。
> 最后更新：2026-08-06，对应提交 `ca1ad2b`。
> **先读这一份，再按需展开下面链接的文档。**

---

## 0. 三十秒了解现状

| 项 | 状态 |
|---|---|
| `tsc --build` | 0 error |
| 全量单测 | **125 文件 / 830 条全绿** |
| 测试发现门禁 | 全覆盖 |
| 全量 e2e | **44 条全绿** |
| 默认渲染器 | **HTML / DOM**（2026-08-06 起，依据见性能报告）|
| 部署 | Vercel 配置已就绪，**等配 Secrets 才能真跑** |

跑起来：`pnpm dev` → http://localhost:3100

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
  core/              渲染器无关的业务核心：node schema、CanvasOp、视口裁剪、LOD、夹具、素材
  renderer-dom/      DOM 渲染器 + 浏览器探针
  renderer-leafer/   LeaferJS 渲染器 + 浏览器探针
  renderer-reactflow/ React Flow 探针（仅调研，未成为可选渲染器）
  server-core/       Prisma client、后端领域逻辑
  provider/          生成 provider（目前是 mock）
apps/web/            Next.js 应用（App Router + Route Handlers）
e2e/                 Playwright
prisma/              schema + migrations（SQLite）
docs/                架构、报告、部署
tools/               Prisma 包装器、测试发现门禁、录制脚本
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
pnpm dev                # 开发服务器，端口 3100
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

**仍待完成**：
- 迟滞（防在档位边界反复横跳）是否已完整落地，需要核对
- 800% 档实际清晰度的端到端验证（`naturalWidth` 相对节点显示尺寸的比值）
- 下载字节数的改前改后对比

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
2. **飞书导入** —— 竞品调研文档已写好，需要人跑一次 `node authorize.mjs` 重新授权（`drive:drive`）
3. **小地图「增加内容」的具体所指** —— 用户提过但未展开，候选：当前视口框、点击/拖拽跳转

### 4.3 已知未闭合项
- **fan 模式 50% 档 44.75 fps，未达 60** —— 端点早退有效但不是全部答案
- **连线分档阈值 512 的推导过程未经复核** —— 执行方收尾前被中止，
  书面论证没留下，只有 11 份探针原始结果随提交入库。结果复核过（44/44 + 全量单测绿）
- **8K 素材实测返回 400，未收录** —— 如实标注，没有伪装成可用素材
- **内存未测** —— 页面级 API 无法可靠覆盖 DOM/布局/合成层/浏览器进程总内存，
  `performance.memory` 只代表部分 JS heap，**故不采集，而不是估一个数**
- **只测了 HeadlessChromium** —— 真机与 GPU 环境下 canvas 的合成路径未必被充分利用，
  DOM vs Leafer 的相对表现**可能不同**
- **画布 `dot` LOD 档位（scale<0.2）仍把节点降级成纯点** ——
  用户提过"一眼看出类型"的诉求，小地图那边做了，画布这边没做
- **LLM 接口只有设计，provider 仍是 mock**

---

## 5. 部署（配好 Secrets 就能自动跑）

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
- **"已挂载"不等于"屏幕上看得见"**：挂载集合包含 overscan 区。
  Leafer 探针按"第一个已挂载节点"取证，节点在视口外时永远取不到像素，整个探针跑不起来

### 7.3 性能
- **一侧的优化收益不能外推到另一侧**：批量 path 对 DOM 有效（46.41→59.67），
  对 Leafer 是 **-50.4% 回归**（25% 档 15.47→7.67）。两个渲染器的性能模型是各自独立的
- **性能优化必须保留"无工作量"对照档**：10% 档两侧都没变化，
  是因为那一档 LOD 本就把连线整个裁掉了。没有这个对照就会把"本来没干活"误读成结论
- **上限只截输出不截工作量是常见陷阱**：`maxConnections` 原本只影响"最终渲染几条"，
  不影响"算了多少条" —— fanin 下全文档 1 万条线每次都物化+排序，最后才丢掉 9000 条

### 7.4 工程环境
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
