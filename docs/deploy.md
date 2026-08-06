# 部署到 Vercel

生产链路固定为：`push main` → GitHub Actions 全量门禁 → Vercel CLI 生产部署。任意门禁失败，部署步骤都不会执行。

> 🔴 不要同时开启 Vercel 的 Git 自动部署。否则 Vercel 会在 GitHub Actions 结束前直接接收 `main` 推送，绕过本仓门禁。生产部署只能由 `.github/workflows/deploy.yml` 发起。

## 1. 第一次部署

### 1.1 创建 Turso 数据库

先安装并登录 [Turso CLI](https://docs.turso.tech/cli/introduction)，然后创建数据库：

```bash
turso auth login
turso db create framewright
turso db show --url framewright
turso db tokens create framewright
```

保存最后两条命令返回的 URL 与 token。它们只进入 Vercel/GitHub 的 Secret，不写入仓库。

### 1.2 初始化生产数据库

Prisma Migrate 不能直接把 migration 部署到远程 Turso。仓库仍然用本地 SQLite 生成 migration，生产端按顺序用 Turso CLI 执行 SQL。

当前第一次部署需要依次执行这两个文件：

```bash
turso db shell framewright < prisma/migrations/20260804095949_init/migration.sql
turso db shell framewright < prisma/migrations/20260804104947_b2_backend_domain/migration.sql
```

PowerShell 不支持 Bash 的 `<` 输入重定向，可改用：

```powershell
$sql = Get-Content -Raw prisma/migrations/20260804095949_init/migration.sql
turso db shell framewright $sql
$sql = Get-Content -Raw prisma/migrations/20260804104947_b2_backend_domain/migration.sql
turso db shell framewright $sql
```

执行后检查表是否齐全：

```bash
turso db shell framewright ".tables"
```

应至少看到 `Project`、`Document`、`HistoryEntry`、`Session`、`Message`、`Asset`、`Generation`。

以后新增 migration 时，只执行新产生且尚未执行过的 `migration.sql`，并保持目录名的时间顺序。Turso CLI 不替 Prisma 维护 `_prisma_migrations` 记录，不能重复执行已经成功的建表 migration。

### 1.3 创建 Vercel 项目

从 monorepo 根目录创建或关联项目，项目配置如下：

| 设置 | 值 |
|---|---|
| Root Directory | 留空，即仓库根目录 |
| Framework Preset | Next.js |
| Install Command | `pnpm install --frozen-lockfile` |
| Build Command | `npx prisma generate --schema prisma/schema.prisma && pnpm --filter @framewright/web build` |
| Output Directory | `apps/web/.next` |

这些值已写入仓库根的 `vercel.json`。Vercel 项目必须关闭或断开 Git 自动部署，只保留 GitHub Actions 里的 CLI 部署。

在 Vercel 项目设置中确认生产环境使用：

| Vercel 变量 | 值 |
|---|---|
| `DATABASE_URL` | `turso db show --url framewright` 返回的 `libsql:` URL |
| `TURSO_AUTH_TOKEN` | `turso db tokens create framewright` 返回的 token |

工作流部署时也会通过 `--env` / `--build-env` 注入同名值，因此实际部署不依赖本地 `.env`。Vercel 项目中的副本用于人工部署与控制台排障；两处值变更时必须同步更新。

### 1.4 配置 GitHub Actions Secrets

在 GitHub 仓库的 `Settings → Secrets and variables → Actions` 新建以下 Repository secrets：

| Secret | 来源 / 用途 |
|---|---|
| `VERCEL_TOKEN` | Vercel 账户 Token，供 CLI 部署 |
| `VERCEL_ORG_ID` | Vercel 团队或个人账户 ID |
| `VERCEL_PROJECT_ID` | 上一步创建的项目 ID |
| `TURSO_DATABASE_URL` | Turso 的 `libsql:` 数据库 URL；部署时映射为 `DATABASE_URL` |
| `TURSO_AUTH_TOKEN` | Turso 数据库 token |

`VERCEL_ORG_ID` 与 `VERCEL_PROJECT_ID` 可从项目关联后生成的 `.vercel/project.json` 读取，但不要提交 `.vercel/`。`VERCEL_TOKEN` 与 Turso token 不得出现在 workflow、文档、提交信息或日志中。

### 1.5 首次触发

配置完成后 push 到 `main`。Actions 会严格按以下顺序运行：

1. 安装依赖并生成 Prisma Client；
2. 初始化 CI 专用 SQLite 文件库；
3. `pnpm typecheck`；
4. `pnpm test:discovery`；
5. `pnpm test`；
6. 安装 Chromium；
7. `pnpm e2e`；
8. 前七步全绿后执行 `vercel deploy --prod`。

## 2. 数据库 adapter 规则

`packages/server-core/src/prisma.ts` 是唯一的数据库 adapter 选择入口：

- `file:` 与测试使用的 `:memory:` → `PrismaBetterSQLite3`；
- `libsql:`、`http:`、`https:` → `PrismaLibSQL`，鉴权读取 `TURSO_AUTH_TOKEN`；
- 其他协议直接报错，避免悄悄连错数据库。

因此本地开发和 e2e 不需要 Turso：

- `pnpm dev` 未设置 `DATABASE_URL` 时继续使用 `prisma/dev.db`；
- Playwright 明确使用 `file:<仓库>/prisma/e2e.db`；
- e2e 的 `globalSetup` 每轮删除或清空该文件，再通过 `tools/prisma.mjs migrate deploy` 重建；
- 生产部署把 GitHub Secret `TURSO_DATABASE_URL` 映射为运行时 `DATABASE_URL`。

## 3. 常见故障

### GitHub Actions 全绿，但没有部署

先看 `部署到 Vercel 生产环境` 步骤是否被跳过。只有 `push` 到 `main` 会触发该 workflow；PR 与其他分支不会部署。若步骤执行后失败，检查五个 GitHub Secrets 是否都存在且没有多余换行。

### push 后出现两次 Vercel 部署

Vercel 的 Git 自动部署仍然开启。断开该项目的 Git 自动部署，保留 GitHub Actions 的 CLI 部署。否则其中一次部署会绕过门禁。

### 生产报“不支持的 DATABASE_URL 协议”

确认 GitHub 的 `TURSO_DATABASE_URL` 是完整的 `libsql://...`、`https://...` 或 `http://...`，不要填数据库名，也不要填 `TURSO_DATABASE_URL=...` 整行。

### 生产报鉴权失败

重新运行 `turso db tokens create framewright`，同步更新 GitHub 的 `TURSO_AUTH_TOKEN` 与 Vercel 生产环境同名变量，再重新触发部署。不要把 token 打进排障日志。

### 生产报 `no such table`

生产库尚未执行 migration，或 URL 指向了另一个 Turso 数据库。按“初始化生产数据库”依次执行尚未应用的 SQL，再用 `.tables` 核对。

### `prisma migrate deploy` 无法连接 Turso

这是预期边界：Prisma 的远程 Turso 工作流不直接支持 Prisma Migrate。migration 在本地 SQLite 上生成，远程生产库使用 `turso db shell` 执行 SQL。不要因此把 schema 改成 PostgreSQL。

### e2e 报 SQLite 文件锁或数据污染

Playwright 固定 `reuseExistingServer: false`，并由 `globalSetup` 重置 `prisma/e2e.db`；CI 不应手工覆盖数据库 URL。本地 3100 已有开发服务时，不要结束或复用它，可让 e2e 独占另一个端口：

```powershell
$env:FRAMEWRIGHT_E2E_PORT = '3200'
npx playwright test
```

### Vercel 构建报 `better-sqlite3` 或 `.node` 错误

`better-sqlite3` 虽然不承担生产查询，仍是本地/e2e 的运行时依赖。`next.config.ts` 把它和 `@prisma/adapter-better-sqlite3` 保持为服务端外部包，由部署平台按目标系统安装原生预编译产物。先检查构建使用 Node 22、pnpm 未跳过 optional dependencies、安装阶段是否成功；不要删掉本地 adapter 来绕过构建。

本仓已在 `node:22-bookworm`（Linux amd64）干净容器中实际执行 `pnpm install --frozen-lockfile`、Prisma generate 与 Next 生产构建：`better_sqlite3.node` 成功安装为 ELF x86-64 文件，Next trace 同时包含该 `.node` 与 `@prisma/adapter-libsql@6.19.3`。这验证的是与 Vercel 同类的 Linux/Node 22 构建链；首次真实 Vercel 部署仍应保留完整构建日志作为最终平台证据。

若 Vercel 的真实 Linux 构建仍无法安装或追踪该原生模块，按项目停线规则停止部署并保留完整安装/构建日志，不要在未验证的情况下改 schema 或 migrations。
