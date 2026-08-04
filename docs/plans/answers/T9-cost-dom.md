# T9a `renderer-dom` 侧 P0 实现成本报告

## 计时口径

- T4 接口提交 `aa4359f` 到 DOM 初版 `07ddbc4` 的提交时间间隔约 9 分钟；初版之后到
  修复提交 `fdd7684` 又间隔约 49 分钟。
- 后一段包含独立审查、问题定位和等待，不等于 49 分钟纯编码时间。开发时没有逐项计时，
  下表均为依据提交差异回溯的**估算区间**。
- 多个功能共用 `renderNode()`、`toNodeStyle()` 和同一组测试，行间存在重叠，不能把各行
  上限机械相加当作总耗时。可核实的总日历窗口约 58 分钟。

## 成本明细

| 功能项 | 我的做法（具体到 API / 手段） | 实际耗时 | 踩坑与返工 | 有没有让步 |
|---|---|---:|---|---|
| `mount` / `update` / `destroy` 生命周期 | `react-dom/client.createRoot(container)` 建根；两种写入都走 `root.render()`；销毁用 `root.unmount()` 并清空 bounds | 10-15 分钟（估算） | 初版为追求同步读取使用过 `flushSync`，从 React effect 内 mount 时会触发“不安全同步提交”警告；返工移除 `flushSync`，测试改用 React `act()` 等待 commit，并补 Strict Mode 回归测试 | **有**：adapter 的 `mount/update` 返回时不保证 React DOM 已同步 commit；调用方若要立刻查 DOM 必须等待 React 提交。`getRenderedBounds()` 仍在 render 计算阶段同步可读 |
| frame 容器渲染（`clip` / `background`） | `FrameShape` 输出真实嵌套 `<div>`；`background` 映射 CSS `background`，`clip` 映射 `overflow: hidden/visible` | 3-5 分钟（估算） | 无额外返工；DOM 的父子结构天然提供裁剪语义 | 无。这里用了 DOM 方案本来的容器能力，不是模拟裁剪 |
| box 渲染（`fill` / `cornerRadius`） | `BoxShape` 输出 `<div>`；`fill` 映射 `background`，圆角映射 `borderRadius` | 2-3 分钟（估算） | 无 | 无；均为浏览器原生 CSS |
| img / video unsupported 占位 | `makeUnsupportedShape(type)` 复用显式占位组件；CSS `repeating-linear-gradient` + dashed border，并标记 `data-fw-unsupported="true"` | 2-3 分钟（估算） | 无 | **有，且是 P0 明确让步**：没有渲染真实图片/视频，只保证节点存在、几何可测、unsupported 可观测；不能据此评估 DOM 的媒体能力 |
| 父子坐标累加 | `renderNode()` 同时维护 `parentAbsolute`；DOM 布局传 `node.x/y` 父相对坐标，量具用 `parentAbsolute + node.x/y` | 10-15 分钟（估算，含返工） | 初版把绝对坐标直接写给嵌套 DOM 子节点，浏览器又自动叠加父偏移，导致视觉位置重复累加；修复后明确拆成 `position` 与 `absolute` 两套值，并新增嵌套回归测试 | 无最终让步，但这是 P0 最大返工项：node schema 的父相对坐标与量具的画布绝对坐标共存，接口命名不够强制，容易混用 |
| z 序（兄弟数组顺序） | 按 `node.children.map()` 原顺序输出 React children，不设置 `z-index`；同一 stacking context 下后出现兄弟覆盖前者 | 1-2 分钟（估算） | 无 | 无；直接使用 DOM 文档顺序，和 schema 的“数组顺序即 z 序”一致 |
| 选中态描边 | `selection.includes(fwId)` 传入 shape；`withSelection()` 增加 CSS `outline: 2px solid #5B8091` | 2-3 分钟（估算） | 无 | **有**：这是 P0 静态选中提示，不是 P2 完整 selection overlay；outline 位于 viewport transform 内，会随缩放变粗变细，也没有多选包围框和四角控制点 |
| viewport（scale / offset）应用 | 在统一 content wrapper 上设置 `transform: translate(offsetX, offsetY) scale(scale)` 与 `transformOrigin: top left` | 2-3 分钟（估算） | 无；平移写在缩放前，当前 CSS transform 字符串符合既定 viewport 表达 | 无 P0 让步；交互态频率、锚点计算由 core/应用层负责，不在渲染器里私存 viewport |
| `getRenderedBounds()` 收集 | render 递归时向 `Map<fwId, Rect>` 写入画布绝对 `x/y/width/height`；每次 draw 新建 Map，getter 返回副本，destroy 清空 | 5-8 分钟（估算，与坐标返工重叠） | 嵌套节点迫使布局坐标与报告坐标分离；返回副本避免调用方修改内部 Map | **有**：P0 bounds 是未考虑 rotation 的轴对齐 `x/y/width/height`，不是旋转后的 AABB，也不反映 clip 后可见区域；若未来把它用于 hit-test/适应内容会产生额外成本，几何真相应落 core |
| shape 注册表与完整性校验 | `Record<ShapeType, ShapeComponent>` 建 `DOM_SHAPES`；模块加载及 `createDomRenderer()` 时调用 core `assertShapeCoverage()`；unsupported 也必须显式注册 | 3-5 分钟（估算） | TypeScript 已在编译期守住 key 集合，运行时校验仍保留以覆盖未来动态注册；没有返工 | 无；这是额外少量样板代码，换来缺 shape 时立即失败，而非静默漏画 |

## 归并：T5 / T10 中与成本相关的接口摩擦

1. **父相对布局与绝对量具是两套坐标语义**：T5 已实际付出一次返工。T10 又发现草案
   `onNodesMove.x/y` 写成画布坐标，而 node schema 要父相对坐标。若契约不带
   `parentFwId` 并钉死父相对结果，P2 多选拖拽还会再付一次同类成本。
2. **React commit 时序未写进 adapter 契约**：`root.render()` 是并发 React API，强行
   `flushSync` 会在 effect 生命周期中报警。P0 通过“render 时同步算 bounds、DOM 断言用
   `act()` 等 commit”绕开；若上层未来要求 `update()` 返回后 DOM 必须立即可读，需要新增
   flush/ready 语义，而不是重新塞回 `flushSync`。
3. **“空白”不是简单的 DOM 未命中**：root frame 自身覆盖画布，T10 判断框选起点时必须
   把 `root.fwId` 特判为空白；复合生成单元内部按钮还需 `data-fw-interaction="ignore"`。
   DOM 的事件冒泡让监听便宜，但也带来统一 gesture state machine 与 opt-out 的手写成本。
4. **P2 视觉反馈不能沿用 P0 outline**：恒定 2 CSS px 描边、固定尺寸 handle、多选总包围框
   需要独立的未缩放 overlay。当前 P0 实现只是可见性验证，升级不是改一个 CSS 值。
5. **媒体节点的 P0 成本数据不代表产品成本**：unsupported 占位很便宜；真正的
   `img/video`，尤其内嵌视频播放控件，必须在 P1 单独实测，不能把本表的 2-3 分钟外推。

## DOM 侧 P0 小结

P0 的 frame/box 静态渲染大多直接落到 React + CSS 原生能力，代码与认知成本都低；真正
花时间的是**同一 node 同时具有父相对布局坐标和画布绝对量具坐标**，以及 React 并发提交
与 adapter 同步方法表象之间的时序差异。现阶段最大的能力让步不是实现技巧，而是
img/video 仍为占位、selection 仍为随 viewport 缩放的简单 outline；这两项必须在后续成本表
重新计时，不能计作“DOM 已经实现”。
