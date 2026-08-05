// 骨架由编排方预建，目的是把 `pnpm install`（会重写 lockfile 与 node_modules）
// 从并行执行方手里拿走 —— 多个 agent 同时装包必然互相踩。
// 接口与 mock 实现见同目录其余文件。
export {}
