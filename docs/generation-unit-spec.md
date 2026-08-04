# generation-unit-spec — 生成单元视觉规格（M1）

> **`ai-image` / `ai-video` 四种状态各自长什么样。两个渲染器照此实现，不许各自发挥。**
>
> 为什么要这份规格：两侧各自发挥必然画得不一样，而那种不一样是**「没对齐规格」而不是「渲染方案差异」**，会污染选型对照结论。`box` 不需要这一步（纯色矩形没有发挥空间），业务组件需要。
>
> **规格只规定「长什么样」，不规定「用什么手段」**——DOM 侧用 flex/grid、Leafer 侧用绝对定位，各取所长（`docs/domain.md` §2.2）。
>
> 适用：波次 2 的 C1-dom / C1-leafer。

---

## 1. 结构：一个生成单元由哪几层组成

**整体是一个 node，内部这些层都不是 node**（`domain.md` §2.2）。从下到上：

```
┌─ 外框 (frame)  ────────────────────────────┐
│  ┌─ 内容区 (content) ────────────────────┐ │
│  │                                        │ │
│  │        随 status 变化的主体              │ │
│  │                                        │ │
│  ├────────────────────────────────────────┤ │
│  │  底部信息条 (footer)                    │ │  ← 仅 succeeded
│  └────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

| 层 | 何时出现 | 内容 |
|---|---|---|
| **外框** | 恒在 | 圆角矩形，承载边框与选中态 |
| **内容区** | 恒在 | 随 `status` 变化，占满外框减去 footer |
| **底部信息条** | 仅 `succeeded` | prompt 摘要，单行截断 |

## 2. 尺寸与样式常量

**这些值两侧必须一致，写成共享常量**——放 `packages/core/src/generation-unit-style.ts`，两个渲染器都从这里 import，**不许各自硬编码**。

```ts
export const GEN_UNIT_STYLE = {
  cornerRadius: 8,
  borderWidth: 1,
  borderColor: '#D8D8DE',

  footerHeight: 28,
  footerPaddingX: 10,
  footerFontSize: 12,
  footerTextColor: '#5A5A66',
  footerBackground: '#F7F7F9',

  emptyBackground: '#F2F2F5',
  emptyTextColor: '#8A8A96',
  emptyFontSize: 13,

  skeletonBase: '#E8E8ED',
  skeletonHighlight: '#F4F4F7',
  skeletonPeriodMs: 1400,

  progressTrackColor: '#DCDCE3',
  progressBarColor: '#5B8091',
  progressHeight: 3,

  failedBackground: '#FDF2F2',
  failedBorderColor: '#E4A0A0',
  failedTextColor: '#B04A4A',
  failedFontSize: 12,

  badgeInset: 8,
  badgeFontSize: 11,
} as const
```

## 3. 四种状态

### 3.1 `empty` —— 还没生成

- 内容区填 `emptyBackground`
- 居中一行提示文字：**`点击生成`**，`emptyFontSize` / `emptyTextColor`
- 外框用 **1px 虚线**边框（`borderColor`，dash `[4,4]`），与其它三态的实线区分
- **无** footer

### 3.2 `pending` / `running` —— 生成中

**两个状态视觉相同**，区别只在进度条是否有确定进度。

- 内容区是**骨架屏**：`skeletonBase` 底色 + 一条 `skeletonHighlight` 的高光从左向右扫过，周期 `skeletonPeriodMs`
- 内容区**底边**贴一条进度条：高 `progressHeight`，轨道 `progressTrackColor`，条 `progressBarColor`
  - `pending`：进度条走**不定态**（一小段来回跑）
  - `running`：若拿得到进度百分比就走确定态，拿不到则同 `pending`
- **无** footer

> 🔴 **骨架屏必须占满节点的完整尺寸**（`node.width` × `node.height`），不许只画一个居中的小 spinner。
> 理由：生成完成时图片替换进来，**尺寸不变才不会跳动**。这是本规格最重要的一条。

### 3.3 `succeeded` —— 生成完成

- 内容区显示 `src` 指向的图片 / 视频首帧，按 `node.fit` 决定 `contain` / `cover` / `fill`
- 内容区高度 = `node.height - footerHeight`
- **底部信息条**：
  - 背景 `footerBackground`，左右内边距 `footerPaddingX`
  - 内容 = `prompt` 单行，超出**尾部截断加省略号**，不换行
  - 字号 `footerFontSize`，颜色 `footerTextColor`
- 外框实线边框

### 3.4 `failed` —— 生成失败

- 内容区填 `failedBackground`，外框用 `failedBorderColor` 实线
- 居中两行：
  1. `errorMessage`（为空则显示 `生成失败`），`failedFontSize` / `failedTextColor`，超长截断
  2. 其下一个 **`重试`** 文字按钮
- **无** footer

## 4. `AI生成` 徽标

`succeeded` 状态下，内容区**左上角**距边 `badgeInset` 处显示一个 `AI生成` 徽标：半透明深色底 + 白字，`badgeFontSize`，小圆角。

其余三态不显示。

## 5. 内部按钮与 `onNodeAction`

`empty` 的 `点击生成`、`failed` 的 `重试` **都是内部按钮，不是 node**。

**两侧都必须保证**：点击它们**只触发 `onNodeAction(fwId, action)`，不触发选中、不触发拖拽、不触发双击激活**。

| 按钮 | `action` 取值 |
|---|---|
| 点击生成 | `'generate'` |
| 重试 | `'retry'` |

- **DOM 侧**：内部按钮标 `data-fw-interaction="ignore"`，手势状态机遇到它直接放行给按钮自身（`T10-dom` Q7 提出）
- **Leafer 侧**：内部元素自绘，在命中分派时按同样语义排除

这是 `docs/renderer-contract.md` §2 里 `onNodeAction` 存在的理由，也被对标产品实图印证（选中视频后浮出的是剪辑/裁剪/高清/去字幕等**业务动作**，不是图形属性）。

## 6. 两侧允许不同的地方（刻意留白）

以下不做统一要求，**各用各方案最自然的手段**，差异如实记进 `docs/architecture.md` §8.2 成本表：

- 内部布局手段（flex/grid vs 绝对定位计算）
- 骨架屏高光动画的实现（CSS animation vs 逐帧重绘）
- 文字截断的实现（`text-overflow` vs 测量后手动截断）
- 圆角裁剪的实现（`overflow:hidden` vs Canvas clip path）

**统一要求的只有：最终的几何、颜色、字号、层次结构。**

## 7. 验收

1. `getRenderedBounds()` 两侧对同一份 demo 文档**完全一致**（既有 parity 测试自动覆盖）
2. 四种状态在两个渲染器下**逐一目视比对**，截图并排放进成本报告
3. **骨架屏 → succeeded 的切换不产生尺寸跳动**（这是 §3.2 那条红字的直接验收）
4. 点击 `点击生成` / `重试` 只触发 `onNodeAction`，不改变选中集——两侧各写一条测试
