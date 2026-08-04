# Codex 工作指令 —— framewright P0 收口（T8′ + T9a）

仓库根目录 `E:\code\github\framewright`。

## 0. 先读

1. `AGENTS.md` —— 行为规则与禁止项，优先级最高
2. `docs/progress.md` —— 当前进度
3. `docs/plans/2026-08-03-P0-编排与分工.md` —— 交接协议与回报格式

## 1. 你的两个任务

### T8′ — 修几何基线的平台后缀缺陷（**这个要写代码**）

**问题**：当前基线文件是 `e2e/geometry-baseline.spec.ts-snapshots/bounds-dom-win32.json` 与 `bounds-leafer-win32.json`。

`-win32` 是 Playwright 自动加的平台后缀。后果：**换到 Linux 或 CI 上跑，Playwright 找不到同名基线，会当成新基线直接生成并通过——回归防线在非 Windows 环境下等于不存在。**

而我们的基线内容是**纯几何数字，与平台无关**，本就该只有一份。

**要做的**：

1. 在 `playwright.config.ts` 里设置 `snapshotPathTemplate`，去掉 `{platform}` 段。目标路径形如：
   `e2e/geometry-baseline.spec.ts-snapshots/bounds-dom.json`
2. 删掉旧的两个带 `-win32` 后缀的文件，用 `pnpm e2e --update-snapshots` 重新生成
3. **核对新旧基线的内容完全一致**（只应该改文件名，数字一个都不能变）。若数字有变化，**停下上报**，那说明有别的东西变了
4. 跑 `pnpm verify` 确认全绿
5. commit：

```
fix(e2e): 几何基线去掉平台后缀

基线内容是纯几何数字、与平台无关,但 Playwright 默认加 {platform} 后缀,
导致换平台跑时找不到同名基线、当成新基线直接生成 —— 回归防线在非 Windows 上等于不存在。
改 snapshotPathTemplate 去掉平台段,基线数字未变。
```

### T9a — 报告 `renderer-dom` 的实现成本（**这个不写代码，只填表**）

写入 `docs/plans/answers/T9-cost-dom.md`。

这是 `docs/architecture.md` §8.2「实现成本对照表」的原始素材。**它是本项目的核心交付物之一**——对一个真实项目来说，「这个功能装个插件 2 小时 vs 手写 2 天」比「帧率 58 还是 60」更能决定选哪个方案。

对你在 P0 实现 `renderer-dom` 时做的**每一项**，各写一行：

| 功能项 | 你的做法（具体到 API / 手段） | 实际耗时 | 踩坑与返工 | 有没有让步 |
|---|---|---|---|---|

至少覆盖这些项：

- `mount` / `update` / `destroy` 三个生命周期
- frame 容器渲染（含 `clip` 裁剪、`background`）
- box 渲染（含 `fill`、`cornerRadius`）
- img / video 的 unsupported 占位
- 父子坐标累加
- z 序（兄弟数组顺序）
- 选中态描边
- viewport（scale / offset）的应用
- `getRenderedBounds()` 的收集
- shape 注册表与完整性校验

**硬性要求**：

1. **耗时如实写，含踩坑返工的时间。** 这张表失真了，整个项目就白做。不确定就写区间并标注「估算」。
2. **「有没有让步」这一栏最值钱**：有没有哪一项你其实没有用「DOM 方案本来该有的做法」解决，而是绕过去了？如实写。
3. 你之前在 T6/T10 报过的「接口摩擦」，凡是与实现成本相关的，**归并进来**，不要让它散在别处。

commit：

```
docs(t9): renderer-dom 侧 P0 实现成本报告
```

## 2. 硬性纪律

- **只做 T8′ 和 T9a**，不许顺手做别的
- **不许改计划、不许扩范围**
- **不许 `git push`**，只 commit
- **不许 `--no-verify`** 或任何绕过校验的做法
- T8′ 改完必须 `pnpm verify` 全绿才算完成

## 3. 回报格式

```
任务号：T8′ / T9a
状态：完成 / 受阻
新建文件：<路径列表>
修改文件：<路径列表>
测试命令与输出：<原样粘贴,不要概括>
commit：<sha> <message 首行>
偏差：<与指令不一致处；没有就写「无」>
```
