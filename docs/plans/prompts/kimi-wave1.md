# Kimi —— 波次 1：A3 `selection.ts` + A4 `transform.ts` + B1 schema 扩展

仓库根 `E:\code\github\framewright`。

## 0. 先读

> ⚠️ 你的工具只自动加载 `AGENTS.md`，下面 2–5 项必须自己用读文件工具打开。

1. `AGENTS.md` —— 铁律与禁止项，优先级最高（自动加载）
2. `docs/plans/2026-08-03-任务板.md` §2 通用纪律、§3 冲突规避 —— **每个任务都适用，不再重复**
3. `docs/renderer-contract.md` §2 §5 —— 回调签名与 core 函数签名，**照抄，不许自行改**
4. `docs/domain.md` §3.2.1 §3.2.2 §3.3 —— 生成单元、溯源关系、node 模型规则
5. `docs/interaction-spec.md` §3 —— 移动与尺寸的硬性规则

**你的任务与 Codex 的（A1/A2）文件零重叠，可同时开工。** `git add` 按路径，**不许 `git add -A`**。

---

## 1. A3 —— `packages/core/src/selection.ts`

```ts
applySelection(
  current: readonly string[],
  requested: readonly string[],
  mode: SelectionMode,   // 'replace' | 'toggle' | 'add'
): readonly string[]
```

**为什么它必须在 core**：两个渲染器只上报「本次操作涉及的最小集合 + 并入方式」，最终集合由 host 用这一个函数算。否则两侧对 `toggle` / `add` 的去重与顺序理解会不同。

### 语义（钉死）

| mode | 行为 |
|---|---|
| `replace` | 结果 = `requested` 去重后 |
| `toggle` | `requested` 里已在 `current` 的移除、不在的追加 |
| `add` | 并集，**`current` 在前、新增在后** |

**全部模式都要去重且保序**（保序 = 结果的稳定顺序可断言，否则测试会 flaky）。

### 必测

- 三种 mode 各自的基本行为
- `requested` 内部有重复时的去重
- `toggle` 同时含「已选」与「未选」项时，一次调用里两种都正确处理
- `add` 时已存在的项**不移动位置**（保序）
- 空 `requested` + `replace` = 清空
- 不修改入参（返回新数组，`current` 与 `requested` 都不被 mutate）

commit：`feat(core): 选中集合并逻辑 applySelection`

---

## 2. A4 —— `packages/core/src/transform.ts`

```ts
/** 由选中集 + 画布 delta 算出提交参数（父相对坐标） */
computeMoves(root: FrameNode, selection: readonly string[], deltaCanvas: Point):
  ReadonlyArray<{ fwId: string; parentFwId: string; x: number; y: number }>

/** 等比缩放：固定对角，按角点位置算新 rect */
resizeProportional(orig: Rect, corner: Corner, pointerCanvas: Point,
                   opts: { minSize: number }): Rect
```

### `computeMoves` 的三条职责（缺一不可）

1. **父子同选时只保留最上层**——若某节点的**任一祖先**也在 `selection` 里，跳过它。否则祖先移动带着它一起动、它自己又加一次 delta，**视觉上移动两倍**。
2. **排除 `locked` 节点**。
3. **输出父相对坐标**——`x = node.x + deltaCanvas.x`，并带上 `parentFwId`。

> **为什么直接加就对**：`node.x/y` 是父相对坐标（`domain.md` §3.3 规则 1），而父节点本身没动，所以父相对增量 == 画布增量。
> ⚠️ **这个前提依赖「父节点没有旋转/缩放」**。首版成立（`rotation` 首版按 AABB 处理、无 UI 可改），**但请在函数上写一行注释标明这个前提**，将来父节点支持旋转时这里要改。

### `resizeProportional` 的语义

- **固定对角**：拖 `se` 则 `nw` 角不动，拖 `nw` 则 `se` 角不动，依此类推
- **等比**：宽高比保持 `orig` 的比例。指针位置与固定角构成的矩形按长边或短边定尺寸——**取二者中使结果不小于 `minSize` 的那个口径，并在测试里把你的选择固定下来**
- **最小尺寸钳制**：宽高都不小于 `opts.minSize`
- **只有四角，没有边中点**（`interaction-spec.md` §3：生成结果不允许被自由拉伸变形）

### 必测

- `computeMoves`：父子同选时后代**不出现**在结果里（这条是核心）
- `computeMoves`：`locked` 被排除
- `computeMoves`：多层嵌套下 `parentFwId` 正确、`x/y` 是父相对
- `resizeProportional`：四个角各自固定正确的对角
- `resizeProportional`：等比约束成立（新宽高比 == 原宽高比）
- `resizeProportional`：`minSize` 钳制生效
- 不修改入参

commit：`feat(core): 移动与等比缩放的几何计算`

---

## 3. B1 —— schema 扩展：生成单元与溯源关系

改 `packages/core/src/node-schema.ts` 与 `demo-document.ts`。**设计已在 `docs/domain.md` §3.2.1 / §3.2.2 定稿，照做，不要自行发挥。**

### 要做的

1. **`SHAPE_TYPES` 扩为六项**：`['frame', 'box', 'img', 'video', 'ai-image', 'ai-video']`

   ⚠️ 这会让两个渲染器的 shape 注册表**立刻缺项、`assertShapeCoverage` 抛错**——这是**预期的**，正是「两版同步」的机器强制在起作用。**你要做的是给两侧各补一个显式的 unsupported 占位**，让 `pnpm verify` 恢复绿；真实的四态渲染是波次 2 的 C1，不在本任务范围。

2. **新增 `AiGeneratedNode`**（字段见 `domain.md` §3.2.1）：`generationId` / `status` / `errorMessage` / `prompt` / `params` / `src` / `poster` / `fit`，外加 §3.2.2 的 `sourceFwIds: string[]`

3. **`sourceFwIds` 只在生成单元上**——`frame`/`box`/`img`/`video` 不要加

4. **工厂与守卫**：`createAiImageNode` / `createAiVideoNode` / `isAiImageNode` / `isAiVideoNode`，与既有四个保持同样风格

5. **`demo-document.ts` 扩充**：加**至少一组溯源关系**——一个 `ai-image` 派生出**两个** `ai-video`（两个 video 的 `sourceFwIds` 都指向那个 image）。这组数据是波次 2 连线渲染与测试的输入，**必须有**。

   ⚠️ **加节点会改变几何基线**。这是**预期的合法变化**（不是累加口径出错），所以本任务**允许**跑 `pnpm e2e --update-snapshots`，但**必须在回报里贴出新旧基线的 diff**，说明只有新增条目、既有节点的数字一个都没变。既有节点数字若有变化，**停下上报**。

### 必测

- 六个 `fwType` 的守卫互斥
- `createAiImageNode` / `createAiVideoNode` 的默认值：`status` 默认 `'empty'`、`sourceFwIds` 默认 `[]`、`src` 默认 `null`
- 显式传入覆盖默认值
- `sourceFwIds` 的多来源与多派生（一个源 → 两个派生）在 demo 文档里可查

commit：

```
feat(core): 新增生成单元 ai-image/ai-video 与溯源关系 sourceFwIds

SHAPE_TYPES 扩为六项,两侧注册表各补显式 unsupported 占位(真实四态渲染属波次 2)。
sourceFwIds 只在生成单元上,记录「派生自」——一个源可派生多个结果。
demo 文档新增一组溯源关系(1 个 ai-image → 2 个 ai-video)供连线渲染与测试使用。
几何基线因新增节点而更新,既有节点数字未变。
```

---

## 4. 回报

```
任务号：A3 / A4 / B1
状态：完成 / 受阻
新建文件：<路径列表>
修改文件：<路径列表>
测试命令与输出：<原样粘贴>
基线 diff（仅 B1）：<新旧对比,证明既有节点数字未变>
commit：<sha> <message 首行>
偏差：<没有就写「无」>
接口摩擦：<觉得设计别扭的地方；没有就写「无」>
```
