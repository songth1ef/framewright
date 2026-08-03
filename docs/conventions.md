# conventions — 约定

> 命名、目录、组件模式、Git 规范。新增约定往这里追加，不另起文件。

---

## 1. 仓库形态

- **pnpm workspace monorepo**，包前缀 `@framewright/`。
- 包管理器锁定 **pnpm**，不混用 npm / yarn（lockfile 只留 `pnpm-lock.yaml`）。
- Node 版本由 `.nvmrc` / `package.json` 的 `engines` 声明，两处保持一致。

## 2. 目录与包划分（规划）

```
framewright/
├── apps/
│   └── web/                  # 唯一应用：Next.js 全栈（前端 + Route Handlers）
│       └── app/api/**        # 薄适配层，只做解析/鉴权/调 server-core
├── packages/
│   ├── core/                 # @framewright/core         node schema + 树操作 + 会话状态 + RendererAdapter，零渲染依赖
│   │   └── src/
│   │       ├── node-schema.ts        # schema 单一真相源：类型/字段常量/守卫/默认值
│   │       └── shapes/<name>.ts      # shape 的纯逻辑段（参数 → 可绘制中间产物），见 architecture §10
│   ├── renderer-dom/         # @framewright/renderer-dom     DOM/HTML 渲染器（React/tsx）
│   ├── renderer-leafer/      # @framewright/renderer-leafer  LeaferJS 渲染器
│   ├── server-core/          # @framewright/server-core  全部服务端业务逻辑，纯 TS 零 Next 依赖
│   └── provider/             # @framewright/provider     AI 生成能力的接口 + mock 实现
└── docs/
```

**分层铁律**

1. `core` 不依赖任何渲染器；两个 `renderer-*` 都依赖 `core`，彼此互不依赖。**删掉任何一个 renderer，`core` 必须仍能编译通过。**
2. `server-core` **零 Next 依赖**——不 import `next/*`，不碰 `Request`/`Response`，不读 `process.env` 之外的运行时全局。Route Handler 负责把 HTTP 翻译成函数调用。这条守住了，将来拆成独立 NestJS 服务只需重写适配层。
3. `core` 与 `server-core` 共享 node schema（`core` 导出，`server-core` 导入），**schema 仍然只有一份**。

## 3. 命名

| 对象 | 规则 | 示例 |
|---|---|---|
| 包名 | `@framewright/<kebab-case>` | `@framewright/renderer-dom` |
| 目录 / 文件 | kebab-case | `node-tree.ts` `frame-renderer.tsx` |
| React 组件文件 | kebab-case，组件本身 PascalCase | `frame-node.tsx` → `FrameNode` |
| 类型 / 接口 | PascalCase，**不加 `I` 前缀** | `CanvasNode` `RendererAdapter` |
| 常量 | SCREAMING_SNAKE_CASE | `DEFAULT_FRAME_SIZE` |
| node 的 `fwType` 字段值 | 小写单词 | `frame` `box` `img` `video` |
| **framewright 语义字段** | 加 `fw` 前缀，camelCase | `fwId` `fwType`（几何/呈现字段如 `x` `width` 不加，见 `domain.md` §3.1.1） |
| 测试文件 | 与被测文件同目录，`.test.ts` 后缀 | `node-tree.test.ts` |

## 4. 渲染器模式（本仓最重要的约定）

### 4.1 统一接口

两个渲染器实现同一个 `RendererAdapter`，形状定义在 `core`：

```ts
interface RendererAdapter {
  readonly id: 'dom' | 'leafer'
  readonly displayName: string
  mount(container: HTMLElement, ctx: RenderContext): void
  update(ctx: RenderContext): void          // 树 / 选中 / 视口 变化时调用
  destroy(): void                            // 必须彻底清干净，不留 DOM、监听器、RAF
}
```

`RenderContext` 携带**渲染所需的全部输入**（node 树、选中集合、视口）与**事件回调**（用户想选中什么、想把节点拖到哪、想缩放平移到哪）。

- 命令式接口对两侧都公平：`renderer-dom` 内部自己用 React `createRoot` 渲染 tsx 组件（React 的 diff 本来就是 DOM 方案的固有优势，内部用是合理的）；`renderer-leafer` 内部管自己的 Leafer 实例。
- **同一个 node 类型在两侧必须同名**：`FrameNode` 在 DOM 侧是 React 组件、在 Leafer 侧是节点封装类，名字一致。这是能被对照 review 的前提。
- **上层不允许出现 `if (adapter.id === 'leafer')` 之类的分支。** 差异只能藏在渲染器内部。

### 4.2 在线切换

切换渲染器 = `旧.destroy()` → `新.mount(同一个 container, 同一个 ctx)`。**切换前后画面与状态必须一致**。

由此推出一条硬规则：

> **任何切换后必须保留的状态，都不能存在渲染器内部。**

包括但不限于：node 树、选中集合、视口（缩放 + 平移）、正在编辑的输入值、悬停高亮。这些一律在 `core` / 应用层，通过 `RenderContext` 单向流进渲染器。

渲染器内部只允许持有**纯粹的呈现细节**——DOM 节点引用、Leafer 实例、动画句柄、离屏缓存。这些在 `destroy()` 里全部释放。

**验收方式**：随便操作一通后切换渲染器，画面、选中、视口三者不变，控制台无残留监听器。这是每次改渲染器都要跑一遍的手动冒烟。

### 4.3 两版同步开发

**一个功能在两个渲染器都可用，才算完成。** 允许一侧显式声明不支持，但必须：

1. 在该渲染器里返回明确的「不支持」信号，而不是静默不生效；
2. 在 `docs/lessons.md` 记一条，写清**为什么这个方案做不到**——这恰恰是选型结论最值钱的素材。

不接受「先在 DOM 侧做完，Leafer 侧回头补」。回头补等于永远不补，且会让对照实验失去意义。

**对 shape 而言这条是机器强制的**：`core` 导出 `SHAPE_TYPES` 全集，两个渲染器的 shape 注册表必须覆盖全集，缺一个装载时就报错。加 shape 必须两边都加。见 `architecture.md` §10.3。

## 5. TypeScript

- `strict: true`，且开 `noUncheckedIndexedAccess`。
- 不用 `any`；确实需要逃逸时用 `unknown` + 收窄，并写一行注释说明原因。
- 类型与实现同包导出，不建单独的 `types` 包。

## 6. Git 规范

- **分支**：`main` 为主干；功能走 `feat/<slug>`，修复走 `fix/<slug>`。**push 到 `main` 需用户明确指示。**
- **Commit message**：英文 type/scope + **中文正文**。

  ```
  feat(core): node 树增加 frame 容器类型

  - 定义 CanvasNode 判别联合
  - frame 允许嵌套 box/img/video
  ```

  type 取值：`feat` `fix` `docs` `refactor` `test` `chore` `perf`。
- **一次提交只做一件事**。文档与代码可同提交，前提是它们描述的是同一件事。
- 提交前跑类型检查与测试；不用 `--no-verify` 绕过钩子。

## 7. 文档

- 全部中文。
- 单文件超 **500 行**拆成 `docs/<topic>/<subtopic>.md` + 索引。
- `docs/lessons.md` 只增不删；结论被推翻时**标注推翻**并保留原文，不静默改写。
