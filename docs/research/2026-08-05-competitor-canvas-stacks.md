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
