# 无限画布：DOM vs Canvas —— 外部证据调研

> 调研日期：2026-08-04。用于 `M4 选型结论` 的外部证据。
> **每条结论标注来源 URL 与该来源时间；查不到的明说「未找到公开依据」，不用常识补足。**

---

## 1. 一句话结论

**主流「带复杂节点 UI」的无限画布（React Flow、tldraw）确实是 DOM 优先，且这是刻意的产品决策而非技术能力不足。** Canvas 优先的路线几乎都出现在「图形本身是主体、节点内不需要富交互」的场景；一旦需要富节点 UI，要么打 DOM overlay 补丁，要么反向迁回 DOM。

## 2. 逐库事实表

| 库 | 渲染方式 | 关键证据 | 来源时间 |
|---|---|---|---|
| **React Flow / xyflow** | **纯 DOM**。节点是 React 组件，边是 SVG | 官网 "React Flow nodes are simply React components"；文档「自定义节点 = 写一个 React 组件」 | 2026-08 访问 |
| **tldraw** | **混合，但切法与直觉相反**：图形在 **DOM**，真正的 `<canvas>` **只用于 overlay** | 创始人博客："Shapes on the tldraw canvas are **HTML and CSS in the DOM**, rendered by React, not drawn to a 2D `<canvas>`." / "Canvas elements are used only for small things like selection indicators and the minimap." | **2026-06-12** |
| **Excalidraw** | **纯 Canvas 2D**，双画布 `StaticCanvas` + `InteractiveCanvas`；文字编辑靠绝对定位 HTML overlay | 源码 `packages/excalidraw/renderer/` | 2026-08 访问 |
| **ComfyUI（LiteGraph）** | 原本纯 Canvas 2D，**正在迁往 Vue/DOM** | 官方博客 "transitions our node system from LiteGraph.js Canvas rendering to a Vue-based architecture"；"Canvas2D + Litegraph … are hitting real limits" | **2025-12-05** |
| **@gravity-ui/graph**（Yandex, MIT） | **按缩放级别切换**：低缩放 Canvas，高缩放 HTML/React | 官方博客 + README | 2025-08-07 |
| **AntV X6** | SVG + HTML | xyflow 官方 awesome 列表 | 2026-08 |

## 3. 「为什么用 DOM」——按证据强度

### 强证据（官方一手表述）

1. **节点内要放能用的 Web 内容，是第一卖点不是副产品。**
   tldraw 创始人原话：*"DOM rendering is **the main reason teams choose tldraw**, and it is the first thing the canvas-2D answer erases."* 因为是 DOM，画布上可直接放 button、video、iframe、嵌入文档、甚至另一个 tldraw。
2. **无障碍 / 键盘导航 / 焦点管理免费得到**（React Flow 的 Tab 遍历、ARIA role、`aria-live` 全依赖真实 DOM）。
3. **🔴 有真实项目为 canvas 的 UI 限制付出代价并回退。** ComfyUI 官方迁移理由：老 Canvas2D 架构 *"restrict[s] what we can do in the UI, how custom nodes can interact, how advanced models can expose controls"*。**这是在 AI 生成节点画布这个完全相同的场景里做出的 canvas → DOM 反向迁移。**
4. **Canvas 里的文本输入至今没有好办法。** Excalidraw 到 2026-05 仍在用 *"absolute-positioned HTML overlay hacks for active text inputs"*，并列出丢失的东西：*"native input field focusing, text selection, browser translation, and accessibility tree syncing"*，正在等 Chromium 的 HTML-in-Canvas API。

### 中等证据

5. **DOM 路线的性能天花板被维护者本人承认，但优先级不高。** xyflow 维护者：*"We did some experiments with a canvas renderer for edges but not for nodes yet … it's currently not very high prioritized."*（2025-08-11）

### 推测（未找到直接依据，不得当作事实引用）

6. 「Canvas 要自建 hit-testing / 层级 / 变换，工程量巨大」——Excalidraw #1051 里 vjeux 部分佐证（列出 hit testing、shape caching、canvas caching 三大复杂度），但**没有任何一家公开说过「我们选 DOM 是为了省工程量」**。
7. 「竞品选 DOM 是因为团队前端出身 / 迭代速度优先」——**未找到公开依据，不要写进结论**。

## 4. tldraw 混合方案的切分（源码级验证）

```
div.tl-canvas
├── svg.tl-svg-context          ← 只放 <defs>，不画内容
├── div.tl-background__wrapper
├── div.tl-html-layer.tl-shapes ← ★ 所有图形，每个 shape 是一个 React 组件
├── <CanvasOverlays />          ← ★ 真正的 <canvas>，2D context
└── div.tl-hit-test-blocker
```

| 层 | 技术 | 内容 |
|---|---|---|
| Shape | **DOM**（React），单 shape 内可选 `HTMLContainer` / `SVGContainer` | **可持久化的用户数据**：矩形、文字、图片、嵌入、自定义节点 |
| Overlay | **单个 `<canvas>` 2D context** | **短暂的非持久 UI**：选择指示器、框选笔刷、handle、吸附对齐线、协作者提示 |

**为什么这么切**：持久内容留 DOM 因为那是产品价值所在；overlay 迁 canvas 是**纯性能优化**——官方目标是 *"Eliminate per-overlay DOM nodes and their individual CSS transforms"*、*"Reduce layout/paint overhead from many absolutely-positioned SVG elements"*。

**时间线（2026 年才完成的近期演进，旧资料会说错）**：
- v4.4（2026-02）：shape indicators 从 SVG 改 canvas，官方称某些场景快 **up to 25×**；引入 R-tree 空间索引
- v5.0.0（2026-05-06）：`OverlayUtil` 系统，**"Overlays cannot render React; they draw into a 2D canvas context."**

## 5. 反例：真用 Canvas 且带节点 UI 的开源无限画布

**找不到一个「成熟、有生态、Canvas/WebGL、且节点内有复杂交互 UI」的开源无限画布。**

| 项目 | 情况 |
|---|---|
| **ComfyUI / LiteGraph** | AI 生图领域最大的节点画布，**但正在从 canvas 往回走** |
| **@gravity-ui/graph** | 唯一文档化了 LOD 混合策略的。但 ~139 stars，生态远不如前两者，且它也承认高缩放必须切回 DOM |
| cytoscape.js / Polygonjs | 节点是简单图元，无富 UI，不算反例 |

## 6. 切换临界点：没有官方 N 值，且各来源不一致

| 来源 | 说法 | 时间 |
|---|---|---|
| xyflow 维护者 | 1000+ 节点「不适用，canvas 更好」 | 2023-04（**已 3 年，可能过期**） |
| 社区实测 | 100+ 节点平移缩放已 sluggish | 2025-08 |
| Synergy Codes（第三方基准） | 100 节点正确 memo 化后稳定 60fps；**写错一个匿名函数 prop，重节点直接掉到 2 FPS** | 2025-01 |
| tldraw 官方 | 默认 `maxShapesPerPage` = **4000**；靠 culling 做到「10,000 shapes 可能只渲染 50 个」 | 2026-08 |
| tldraw 创始人 | *"At extreme zoom levels — especially when **hundreds of complex shapes or images** are visible — React-based rendering becomes a bottleneck."* 并提到 **Luma 的画布**为此自实现「渲染 canvas 纹理代替完整 React 组件树」 | 2026-03 |
| @gravity-ui/graph | **不按节点数切，按缩放级别切**；111k 节点压测约 60ms/帧 | 2025-08 |

**共同信号**（归纳，非引用）：

- 数量级共识落在**几百**，不是几千也不是几十
- **决定因素不是节点总数，而是「同屏可见节点数 × 单节点子树复杂度」**——100 个空 div 和 100 个内嵌 DataGrid 差一个数量级
- **视口裁剪（culling）比渲染技术更能决定成败**

## 7. 矛盾与未解之处

1. **🔴 React Flow 官方从未正面回答「为什么不用 canvas」。** 检索了官网 learn/performance、custom-nodes、accessibility 与 GitHub discussions/issues，**没有任何官方论述**。
   **网上流传的「canvas 里的像素放不了下拉菜单」追溯不到 xyflow 官方出处**，只能追到二手技术博客——**不得当作官方表态引用**。
2. **两个方向相反的真实迁移同时发生**：ComfyUI 是 canvas → DOM（节点内容层）；tldraw 是 DOM/SVG → canvas（临时 overlay 层）。**不矛盾——迁的是不同的层**，但只看单边资料极易得出相反结论。
3. xyflow 维护者 2023 年那句「1000+ 不适用」是否仍成立**未知**；官方从未发布带节点数的基准。
4. **无法核实 Krea / Flora / Freepik Spaces 等竞品各自的实现。** 唯一可核实的间接证据：**tldraw 官方把 Luma 和 Runway 列为客户**，两家都是 AI 图片/视频生成产品——**支持「竞品用 DOM」的观察，但样本只有 2 个且是 tldraw 单方陈述**。
5. **Excalidraw 的选型理由有时代局限**：vjeux 2020 年的核心理由之一是 *"I've heard all those horror stories of people doing data visualization in SVG"*——**是听说，不是实测**。
   **Excalidraw vs tldraw 的差别本质是产品目标不同**：前者核心是「手绘视觉风格」节点内不需富交互，后者核心是「画布上能放任意 Web 内容」。**不是同一问题的两个答案。**

## 8. 对本项目的启示（只基于证据）

1. **「竞品都是 DOM」这个观察与可核实证据一致**，且没有反向案例。
2. **「Canvas 才能撑性能」在本场景可能问错了问题**：所有官方数据都指向「同屏可见节点数 × 单节点复杂度」，而主要解法（裁剪、空间索引、memo、LOD）**两条路线都要做**。Synergy Codes 的数据显示**同样 100 节点，写法差异造成 60fps vs 2fps，比渲染技术的差距更大**。
3. **AI 生成画布的节点特征恰好落在 DOM 的优势区**：图片/视频原生解码与懒加载、prompt 文本、参数控件、状态指示、右键菜单——canvas 里全要自建。
4. **真需要极低缩放看几千节点时，混合是唯一被文档化的答案**，两种切法（tldraw 按层 / gravity-ui 按缩放），**都不要求放弃 DOM 主干**。
5. **🔴 对我们 Leafer 版的具体风险（有据）**：会撞上 Excalidraw **六年未解**的问题——canvas 内文本输入需 HTML overlay hack，失去原生 input 聚焦、文本选择、浏览器翻译、无障碍树同步。
   **我们的节点上有 prompt 输入框和可编辑标题（G5 生成参数面板），这必须提前验证，不能留到后期。**
6. **未被证据覆盖的**：没有公开数据说明「AI 生成画布典型节点数」是多少，也没有 LeaferJS 在此类场景的第三方基准。
   **我们自己两个渲染器的实测数据，在这个问题上比任何外部资料都更有权威性**——外部证据回答「别人为什么这么选」，我们的目标规模与节点复杂度只有实测能答。

## 主要来源

- tldraw：[创始人博客 2026-06-12](https://tldraw.dev/blog/20-things-i-wish-ai-chatbots-knew-about-tldraw) · [v5.0.0](https://tldraw.dev/releases/v5.0.0) · [v4.4.0](https://tldraw.dev/releases/v4.4.0) · [#8314](https://github.com/tldraw/tldraw/issues/8314) · [#8307](https://github.com/tldraw/tldraw/issues/8307) · [performance](https://tldraw.dev/sdk-features/performance) · [showcase](https://tldraw.dev/showcase)
- React Flow：[官网](https://reactflow.dev/) · [custom-nodes](https://reactflow.dev/learn/customization/custom-nodes) · [accessibility](https://reactflow.dev/learn/advanced-use/accessibility) · [#3003](https://github.com/xyflow/xyflow/discussions/3003) · [#5446](https://github.com/xyflow/xyflow/discussions/5446) · [#5442](https://github.com/xyflow/xyflow/issues/5442)
- Excalidraw：[#1051](https://github.com/excalidraw/excalidraw/issues/1051) · [#11378](https://github.com/excalidraw/excalidraw/issues/11378) · [renderer 源码](https://github.com/excalidraw/excalidraw/tree/master/packages/excalidraw/renderer)
- ComfyUI：[Node 2.0 博客 2025-12-05](https://blog.comfy.org/p/comfyui-node-2-0)
- gravity-ui/graph：[博客](https://gravity-ui.com/en/blog/graph) · [仓库](https://github.com/gravity-ui/graph)
- 第三方基准：[Synergy Codes 2025-01-23](https://www.synergycodes.com/blog/guide-to-optimize-react-flow-project-performance)
