# 开箱即用的 DOM 画布方案 —— 调研与 license 核实

> 调研日期：2026-08-04。用于「用现成 vs 自建」的决策。
> **license 一栏错了会造成实际损失，故凡未证实的一律标注，不用常识补足。**

---

## 一句话结论

**没有一个库验证过本项目最核心的场景（节点内嵌可播放视频播放器）。** React Flow 是唯一 license 干净且交互层完整的起点；**tldraw 技术最贴合，但 license 已证实禁止闭源商用生产使用，出局**。

## 🔴 License 裁决

| 库 | License | 能否用于本项目 |
|---|---|---|
| **tldraw** | **自定义 tldraw license** | ❌ **出局** —— 已证实**禁止闭源商用生产使用** |
| **React Flow / xyflow** | MIT | ✅ 可用。⚠️ 见下方 attribution 灰区 |
| Vue Flow | MIT，**完全没有付费层**（仅 GitHub Sponsors） | ✅ |
| Svelte Flow | MIT + Pro（同 React Flow） | ✅ |
| LogicFlow / AntV X6 | MIT | ✅ |

### ⚠️ React Flow 的 attribution 灰区（**未证实的部分明确标出**）

官方页面（`reactflow.dev/learn/troubleshooting/remove-attribution`、`/remove-attribution`、`/pro`）只有这两类措辞：

> "Subscribing to React Flow Pro **permits** you to remove the attribution"
> "**Only remove this attribution, if you are subscribed** to React Flow Pro"

**官方从未说过「不订阅也可以移除」。**

调研过程中出现过一条相反的说法（称官方承认 MIT 下无法在法律上强制保留 attribution），**逐页核实后查不到，已推翻，不得采信**。

**现状**：MIT 条款本身不含 attribution 保留义务（这是法律解读，不是官方表态），但**把它当成「官方已背书零风险」不成立**。要移除水印，官方路径是订阅 Pro：**Starter $169/月、Professional $289/月、Enterprise 询价**（一手确认，Pro **不 gate 任何核心库功能**）。

## 🔴 最重要的一条：没有库验证过「节点内嵌视频播放器」

**调研过的所有库中，没有任何一个有官方示例演示节点内放 `<video>` 播放器**——全部标注为「未找到公开依据」。

各库的适配判断只能基于它们对 HTML 容器的官方表述与限制条款推导，其中两条明确的限制值得记：

- **AntV X6** 对节点内 HTML 的 `position` / `transform` / `opacity` 有禁用警告
- **reaflow** 用 `foreignObject`，存在事件劫持问题

**含义**：视频节点的内存治理、懒挂载、多路并发——**没有任何库替你验证过，这部分必然自己写**。而这恰恰是本项目最核心、也最可能决定选型的能力。

## 端口税：比预想的小

原本担心用节点图库会被迫吃下整套「端口 / 句柄 / 连线校验」语义。**实际情况没那么糟**：

> Vue Flow 官方：*"**Without handles, it is basically impossible to create edges between nodes**"*
> Svelte Flow 官方：*"Custom nodes need to have **at least one Handle** component to be connectable."*

**但边对象本身只需要 `source` + `target` 两个节点 id**，`sourceHandle` / `targetHandle` 仅在单节点有多个 handle 时才需要。

→ **「A 派生自 B」确实能写成一行 `{ source, target }`，端口税只是每个节点一个隐形 `div`。**

⚠️ 另注：Vue Flow 的 `connection-mode` **默认是 `Loose`**（允许 source→source），要严格方向必须显式设 `Strict`。

## 撤销重做：格局与我们无关

| 库 | 撤销重做 |
|---|---|
| **LogicFlow** | ✅ **内置** `lf.undo()` / `lf.redo()`，默认控制栏带按钮 |
| AntV X6 | ✅ history 插件 |
| reaflow | ✅ `useUndo` |
| **React Flow** | ❌ **纯自研** |
| Svelte Flow | ❌ 连付费示例都没有（`/examples/interaction/undo-redo` → 404） |
| Vue Flow | ❌ 51 个文档/示例文件全文检索，"undo"/"redo" **出现 0 次** |

**「React Flow 在撤销上落后于 LogicFlow / X6」是事实**——但**对本项目不构成劣势，因为我们已经写完了**（`core/history.ts` 操作日志 + `server-history.ts` 跨会话持久化）。

而且拿 LogicFlow / X6 换内置 undo 是**用「杀鸡用牛刀」换「省一个模块」**——它们的节点图语义比 React Flow 更重（SVG + `foreignObject` 或双层架构）。

## 持久化

Vue Flow 官方原话：*"**There is no built-in persistent storage feature**, however you can use your own storage implementation."*

即 `toObject()` / `fromObject()` 只负责取/灌数据，**存储层仍要自建**。

⚠️ **Svelte Flow 比 Vue Flow 更弱**：`fromObject()` **根本不存在**，官方 save/restore 示例 404。

## 「节点是 DOM」的证据等级（下调）

`reactflow.dev` / `svelteflow.dev` **全站都没有一句「nodes are rendered as DOM/HTML」的明文**。结论不变，但依据是**间接证据链**：

- `Node.domAttributes` 的类型逐字是 `Omit<HTMLAttributes<HTMLDivElement>, …>`，描述为 *"escape hatch for adding custom attributes to the node's **DOM element**"*
- CSS 类表把两者分得很清楚：`.svelte-flow__edge-path` = *"The SVG `<path/>` element of an Edge"*，而 `.svelte-flow__node` 无 SVG 字样
- *"Nodes can contain any content, so their dimensions are determined by the **browser's layout engine**"*
- Handle *"are just `div` elements"*

## 对本项目的启示（只列证据，不下结论）

1. **tldraw 出局是确定的**——技术最贴合也没用，license 禁止闭源商用生产使用。
2. **React Flow 的「端口税」比预想小**，但**attribution 是个未消除的灰区**（要么显示水印，要么 $169/月起）。
3. **撤销这一项我们已经自建完成**，各库的差异对我们不产生影响。
4. **🔴 最核心的那条能力（节点内嵌可播放视频）没有任何库验证过。** 这意味着：**选任何库，这部分都要自己写**——而它恰恰是本项目最可能决定成败的地方。
5. 承接用户 2026-08-04 的判断（React Flow 心智模型是「图」不是「编辑器」，对标的是客户端级手感）：**上面第 4 条是这个判断的独立佐证**——不是「框架不够好」，而是**没有框架趟过你最关键的那条路**。

## 调研质量说明

本次调研过程中，执行方**自己推翻了一条查不到出处的 license 表述**，并明确写「license 一栏错了会造成实际损失，宁可标记为未证实也不写进结论」。这个处理方式是对的，留档。
