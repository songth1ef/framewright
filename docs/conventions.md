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
│   ├── web/                  # 前端应用（Next.js 或 Vite+React，见 architecture 开环）
│   └── server/               # 后端（NestJS）—— 是否进 MVP 待定
├── packages/
│   ├── core/                 # @framewright/core   node schema + 类型 + 纯逻辑，零渲染依赖
│   ├── renderer-dom/         # @framewright/renderer-dom     DOM/HTML 渲染器
│   ├── renderer-leafer/      # @framewright/renderer-leafer  LeaferJS 渲染器
│   └── provider/             # @framewright/provider  AI 生成能力的接口 + mock 实现
└── docs/
```

**分层铁律**：`core` 不依赖任何渲染器，两个 `renderer-*` 都依赖 `core`，彼此互不依赖。任何一个 renderer 被删掉，`core` 必须仍能编译通过。

## 3. 命名

| 对象 | 规则 | 示例 |
|---|---|---|
| 包名 | `@framewright/<kebab-case>` | `@framewright/renderer-dom` |
| 目录 / 文件 | kebab-case | `node-tree.ts` `frame-renderer.tsx` |
| React 组件文件 | kebab-case，组件本身 PascalCase | `frame-node.tsx` → `FrameNode` |
| 类型 / 接口 | PascalCase，**不加 `I` 前缀** | `CanvasNode` `RendererAdapter` |
| 常量 | SCREAMING_SNAKE_CASE | `DEFAULT_FRAME_SIZE` |
| node 的 `type` 字段值 | 小写单词 | `frame` `box` `img` `video` |
| 测试文件 | 与被测文件同目录，`.test.ts` 后缀 | `node-tree.test.ts` |

## 4. 组件与渲染器模式

- **同一个 node 类型，在两个渲染器里必须叫同一个名字**（`FrameNode` 在 DOM 侧是 React 组件，在 Leafer 侧是节点封装类，名字一致）。这是双实现能被对照 review 的前提。
- 渲染器对外只暴露一个统一入口（挂载、更新、销毁、选中态、事件回调），形状定义在 `core` 的 `RendererAdapter` 接口里。**上层代码不允许出现 `if (renderer === 'leafer')` 之类的分支**。
- 渲染器内部不持有业务状态，状态只有一份、在 `core`/应用层。渲染器是纯粹的「把 node 树画出来 + 把交互事件抛回去」。

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
