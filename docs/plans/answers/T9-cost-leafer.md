# T9b — renderer-leafer 侧 P0 实现成本报告

> 作答人：renderer-leafer 实现者（Kimi）。喂给 `docs/architecture.md` §8.2 实现成本对照表。
> 耗时为 agent 执行口径的**估算**（区间），含踩坑返工；T6 实际从建包到 commit 约 1 小时。
> 「有没有让步」一栏如实写全，这是本表最值钱的部分。

| 功能项 | 做法（具体到 API / 手段） | 实际耗时 | 踩坑与返工 | 有没有让步 |
|---|---|---|---|---|
| `mount` / `update` / `destroy` 生命周期 | `new Leafer({ view: container })`（index.ts:60）；`update` = `leafer.clear()` + 全量重建（index.ts:47）；`destroy` = `leafer.destroy()` + 清 bounds（index.ts:68-72） | ~10 min（估算） | 无 | **有：`update` 是全量重建场景图，零增量。** P0 共 7 个节点无感；节点上千时每次 update 全清全建的成本**未测**，留给 benchmark。另：`destroy` 后 `getRenderedBounds()` 的语义接口没定义，我自定为主动清空返回空 Map（T6 接口摩擦 #4），一行成本但属契约灰色地带 |
| frame 容器渲染（`clip` / `background`） | `new Box({ fill, overflow: clip ? 'hide' : 'show' })`（registry.ts:31-38） | ~10 min（估算） | 无表面坑 | 🔴 **最大让步：`clip` 空转。** 子节点 add 到 leafer 根而非 frame 的 Box（index.ts:40），Box 内没有任何子节点可裁，`overflow:'hide'` 是摆设。容器类用了、容器性没用。T6 接口摩擦 #1 已报，T12 专项评估 |
| box 渲染（`fill` / `cornerRadius`） | `new Rect({ fill, cornerRadius })`（registry.ts:40-47） | ~5 min（估算） | 无 | **无让步。** Leafer `Rect` 与 schema 字段几乎一一对应，是全任务最顺的一项——这正是「box 是几何对照的最佳测试载体」的实证 |
| img / video 的 unsupported 占位 | `new Rect({ fill:'#DDDDDD', stroke:'#999999', dashPattern:[4,4] })`（registry.ts:53-64） | ~5 min（估算） | 无 | **有：占位视觉不与 DOM 侧对齐**（DOM 是斜纹渐变 + 虚线边框，Leafer 是纯色 + 虚线描边）。只保证「可辨识的占位 + 几何一致」，刻意不追求像素相似。两版同步的底线是「都有显式占位」，达标 |
| 父子坐标累加 | `buildNode` 递归自算 `absolute`（index.ts:25），子节点一律 add 到 leafer 根（index.ts:40） | ~10 min（估算） | 无返工，但这是后续税的源头 | **有：没用 Leafer 原生父子坐标系。** Leafer 的容器本来就提供相对定位与变换级联，我们绕开它手工累加。单行加法本身零难度，但「绕开原生机制」使得 clip / 拖拽预览 / visible 级联都要另补（见 T12） |
| z 序 | 场景图打平后 add 顺序即 z 序，与 schema「children 数组顺序即 z 序」自然同构 | 0（顺带获得） | 无 | 无让步。正确性由 T8 parity + 基线覆盖 |
| 选中态描边 | `applySelection` 直接设 `ui.stroke / ui.strokeWidth`（registry.ts:23-29） | ~5 min（估算） | 无（P0 没爆是因为没有触发路径） | **有两处：① 选中描边与节点自身描边共用同一通道**——img/video 占位自带 `stroke:'#999999', strokeWidth:1`（registry.ts:58-59），被选中时被覆盖，且 P0 的「取消选中」路径不存在所以没爆；P2 选中视觉必须是独立 overlay。**② 2px 描边未做 1/scale 补偿**（P0 视口恒为 1 所以无感，契约 §6 遗留项 1 已留档） |
| viewport（scale / offset）的应用 | `leafer.scale / leafer.x / leafer.y` 直接设在 Leafer 根实例上（index.ts:49-51） | ~5 min（估算） | 无（P0 无交互） | **有隐患不算让步：transform 设在根上，与 Leafer interaction 内建手势的管辖权重叠。** P2 必须逐项 `disabled` 内建手势（契约 §3 红线），否则状态泄漏。排查内建手势的 d.ts 调研成本 ~30–40 min（估算）记在 T10，属 P2 前置排雷而非本项实现成本 |
| `getRenderedBounds()` 的收集 | `buildNode` 顺路 `bounds.set(fwId, 绝对矩形)`（index.ts:26-31），返回 `new Map(bounds)`（index.ts:74-76） | ~5 min（估算） | 无 | **有：自报而非测量。** bounds 来自我方累加计算，不是从 Leafer 渲染结果回读。若将来渲染路径与累加逻辑脱节（某层偏移漏加），bounds 会**一致地错、parity 照样绿**。契约语义（画布绝对坐标）允许如此，但这条账要记 |
| shape 注册表与完整性校验 | `LEAFER_SHAPES: Record<ShapeType, ShapeFactory>`（registry.ts:66-71）+ `assertShapeCoverage` 在模块顶层（registry.ts:73）与 `createLeaferRenderer()`（index.ts:14）各调一次 | ~5 min（估算） | 无 | 无让步。两处调用重复但无害：模块加载即兜底、工厂调用再兜底 |
| 映射函数与「不泄漏」测试（基建） | `toLeaferProps` 窄返回 7 字段（node-props.ts）+ 4 条单测 | ~15 min（估算） | **唯一真实返工**：计划给的测试断言 `as Record<string, unknown>` 在 strict 下编译报 TS2352（无索引签名 interface），改 `as unknown as Record<string, unknown>`，~5 min | 测试断言方式让步（多一层 `as unknown`），断言语义不变 |
| **合计** | — | **约 50–70 min（估算，agent 口径）**，其中返工 ~5–10 min | — | — |

## 归并：T6 / T10 报过且与成本相关的接口摩擦

1. **`Rect` 命名碰撞**（T6 摩擦 #5）：core 的量具类型与 leafer-ui 的类同名，每处 import 要 `as CoreRect`。单行成本，但每个新渲染器都会撞一次。
2. **`clip` 空转**（T6 摩擦 #1）：已并入上表「frame 容器渲染」行，不重复计。
3. **`mount` 与 `update` 时序契约不明**（T6 摩擦 #3）：P0 未产生实际成本；P2 交互接入后 update 频率大增，时序契约不钉会在这里兑现成本。
4. **Leafer 内建手势排查**（T10）：~30–40 min d.ts 调研（估算），换来契约 §3 红线与 §6 遗留清单——**这是 Leafer 方案特有的「必修课成本」**：它功能多，但多功能即多泄漏面，用之前必须先摸清哪些要关。DOM 方案没有这一课。
