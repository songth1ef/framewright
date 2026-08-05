# 竞品画布技术栈实抓（2026-08-05）

> 方法：Playwright 加载页面 + **下载其 JS bundle 并 grep 库特征字面量**。
> 后者是关键 —— 打包产物里通常保留 `react-flow__` 之类的类名与包名，**能穿透登录墙**。

---

## 一句话结论

**liblib 确认使用 React Flow**（硬证据）。**neodomain 加载了 PlayCanvas（WebGL 3D 引擎）**，
但归属存疑。即梦与 magnific 未能测出。

---

## 逐站结果

| 站点 | 结论 | 证据强度 |
|---|---|---|
| **liblib** | **React Flow / xyflow** · Next.js + Turbopack | ✅ **硬证据** |
| **neodomain** | Vue + Element Plus + Ant Design · rolldown 打包 · **加载了 PlayCanvas 1885 KB** | ⚠️ 部分（见下） |
| **即梦** | Rspack 打包 + React（`data-react-helmet`） | ⬜ 画布库未测出 |
| **magnific** | — | ❌ WAF 拦截，未进站 |

### liblib —— 唯一拿到硬证据的

抓取其 135 个 JS 包中的前 30 个（共 2172 KB），**同时命中 `reactflow` 与 `@xyflow` 两个字面量**。
另有 `turbopack-*.js`，说明是 **Next.js + Turbopack**。

**含义**：React Flow 是 DOM 渲染的，所以 **liblib 的画布节点就是 DOM 元素**。
这与 §8.4 里那条独立证据同向 —— ComfyUI 在同场景做过 Canvas → DOM 的反向迁移。

### neodomain —— 有意思但证据不足

Bundle 构成：`vue-vendor` 130KB · `element-plus-vendor` 1024KB · `ant-design` 525KB ·
`index` 1324KB · **`playcanvas-vendor` 1885KB** · `rolldown-runtime`（打包器是 rolldown）。

`/neo-tv` 页面本体实测：1362 元素 / 3 canvas / 132 svg / **40 video** / 48 img，
`data-v-6588d680` 出现 912 次（Vue scoped 样式的标志）。

🔴 **但归属存疑**：`/neo-tv` 与 `/canvas` 两个路由返回的 **bundle 列表完全一致** ——
这是 SPA 外壳的特征，**很可能两个路由都没真正进到画布编辑器**。
所以「PlayCanvas 用于画布」这一条**未证实**，只能说「站点加载了它」。

### 即梦 —— 登录墙后

214 个 JS 包，抓了前 30 个（1859 KB），**无任何画布库命中**。
外壳可见 `data-rspack`（字节自家 Rust 打包器）与 `data-react-helmet`（React）。
画布 bundle 应是登录后懒加载，未进入抓取范围。

---

## 🔴 方法论：为什么要抓 bundle 而不只看 DOM

三个站点的画布都在登录墙后，DOM 抓不到。**但打包产物是公开可下载的**，
而库的类名前缀、包名会以字面量形式留在里面。

这个办法的**限制也要写清楚**：

1. **只能证明「加载了」，不能证明「用在哪」** —— neodomain 的 PlayCanvas 就卡在这一步
2. **懒加载的包抓不到** —— 即梦的画布 bundle 就是这种情况
3. 抓取有上限（本次每站前 30 个包），**没命中不等于没有**

**所以本文件里「未测出」与「确认没有」是两件事，不要混读。**

---

## 与 08-04 那轮调研的关系

08-04 查的是「有哪些库可选、license 如何」，结论是
**没有一个库验证过节点内嵌可播放视频播放器**。

本轮查的是「竞品实际选了什么」。**liblib 选了 React Flow** 这条，
说明该库在真实产品里扛住了 AI 生成画布的场景 —— 但它**仍然不能回答视频节点那条**，
因为我们看不到它的画布内部实现。

---

## 待办：能拿到登录后 DOM 的话，值得看三件事

1. **节点里有没有真的视频播放器**（不是缩略图、不是弹窗，是卡片上直接播）
2. **节点数上千时怎么办** —— 有没有视口虚拟化，缩小时挂载多少
3. **连线是用户拖出来的还是生成动作的副产品**

若用户能在已登录的浏览器里保存画布页 HTML（DevTools → Elements → 右键 `<html>` →
Copy outerHTML），或导出 HAR，即可离线分析。

---

# 第二部分 · 竞品的 CLI 布局（2026-08-05）

## 确认有官方 CLI 的

### ① LibTV CLI（liblib）

```bash
curl -fsSL https://liblibai-web-static.liblib.cloud/cli/latest/install-libtv-cli.sh | bash
libtv login web          # 网页登录，凭据自动同步本地
```

覆盖**视频、图像、角色**。官方落地页 <https://www.liblib.tv/cli>
宣传语：**「一行指令，让 LibTV 进入你的 Agent 工作流」**。

明确列出的集成对象全是**编码 Agent**：
Kimi Code/Claw · MiniMax Agent · 小龙虾 · Trae · 腾讯云代码助手 · 通义灵码。

### ② 即梦 CLI（`dreamina`，字节官方）

```bash
curl -fsSL https://jimeng.jianying.com/cli | bash    # 装到 ~/.local/bin/
```

| 命令 | 能力 |
|---|---|
| `dreamina text2image` | 文生图 |
| `dreamina image2image` | 图生图 |
| `dreamina image_upscale` | 图片放大 |
| （视频生成） | 底层 **Seedance 2.0**，多模态音视频联合生成 |

所有生成命令支持 `--poll` 做异步任务自动轮询。

### ③ ComfyUI Skill CLI（第三方）

Agent 友好，结构化 JSON 输出，专为 Claude Code 这类 agent 通过 shell 调用设计。

## 未搜到官方 CLI 的

**Runway · Luma · Krea · Freepik · Magnific** —— 都有 API，但未搜到官方 CLI。

⚠️ **「未搜到」≠「确认没有」。** 搜索范围有限，与本文件第一部分抓 bundle 的限定同理。

---

## 🔴 真正值得注意的不是「谁有 CLI」，是这个模式

**两家中国竞品的 CLI 都不是面向开发者的 API 封装，而是面向 AI Agent 的接入口。**

LibTV 落地页列的是编码 agent，不是 SDK 文档。
即梦那边已有人把它包装成 OpenAI 协议 API（[JimengCli_api](https://github.com/xiaozhichao2025/JimengCli_api)），
卖点是**「让自己的工作流通过 API 接入自己的账号、使用自己的积分」**。

**含义：他们在赌「画布是一个门，agent 可调用的 CLI 是另一个门，同一个后端两个入口」。**

### 对本项目的直接影响

`packages/provider` 就是这个接缝。它目前只有 mock，接口按「可替换」设计。

**如果哪天要接真实生成能力，接的很可能不是某家的 REST API，而是这类 CLI** ——
因为 CLI 自带账号与积分调度，绕开了自己申请 API key 与计费对接的成本。

这让那条硬约束（provider 必须可替换、仓内只保留 mock）比当初写下时更有价值：
**它让画布一行代码不改就能把外部 CLI 接成 provider。**

---

# 汇总：目前对竞品的全部已知

| 竞品 | 画布技术栈 | CLI | 证据强度 |
|---|---|---|---|
| **liblib / LibTV** | **React Flow（xyflow）· Next.js + Turbopack** | ✅ **有官方 CLI** | 栈=硬证据（bundle 双命中）· CLI=官方页面 |
| **即梦（字节）** | Rspack + React，画布库未测出 | ✅ **有官方 CLI**（`dreamina`） | 栈=仅外壳 · CLI=多来源一致 |
| **neodomain / Neowow** | Vue + Element Plus + Ant Design · rolldown · **加载了 PlayCanvas 1885KB** | 未见 | ⚠️ PlayCanvas 归属存疑 |
| **magnific** | 未知 | 未见 | ❌ WAF 拦截，未进站 |
| Runway / Luma / Krea / Freepik | 未查 | 未搜到 | ⬜ |

## 三条可用于决策的结论

**1. 直接竞品 liblib 走的是 DOM 路线。** React Flow 是 DOM 渲染的，节点即 DOM 元素。
这与另一条独立证据同向 —— ComfyUI 在同场景做过 Canvas → DOM 的反向迁移。

**2. 但 React Flow 没有回答本项目最关键的那条路。**
08-04 的库调研结论是：**所有查过的库都没有官方示例演示节点内嵌可播放视频播放器**。
liblib 用它扛住了 AI 生成画布，但我们看不到它的画布内部实现 ——
所以「liblib 用 React Flow」**不等于**「React Flow 能解决视频节点」。

**3. CLI 这一层值得早点想。** 竞品把「agent 可调用」当成第二个产品入口，
而这恰好是我们的 provider 接缝天然支持的形态。
