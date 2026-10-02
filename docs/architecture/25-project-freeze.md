# 25_最终项目目录与模块冻结执行记录

本文件对应施工规范《25_最终项目目录与模块冻结规范》，记录本次实际代码收口。

## 冻结目录

`src/` 现在按 app / pages / components / features / services / adapters / playback / data / storage / state / models / utils / config 分层；Playback 下固定 core / parser / player / session / events / network / errors。

## 依赖方向

- App 负责页面编排、运行时入口与导航组合。
- Pages 负责页面级展示与页面组合，不直接访问 Storage、Raw Parser、Player Internal 或 Adapter。
- Features 通过 Service 消费业务能力。
- Storage 只作为基础设施被上层服务调用。
- Playback 页面通过 Playback Service / Playback Core 进入播放链路。
- Adapter 与 React 页面状态解耦。

## 本次收口

1. `src/main.jsx` 收缩为纯启动入口，业务编排迁移到 `src/app/App.jsx`。
2. 原首页/“我的”页面组合迁移到 `src/pages/MainPage.jsx`。
3. VOD/Live 播放页面组合迁移到 `src/pages/PlaybackPage.jsx`。
4. 增加架构冻结自动检查 `scripts-test-architecture-freeze.mjs`。
5. `npm test` 的统一验收入口新增架构冻结门槛。
6. 新增模块继续沿冻结目录放置；不新增跨层直连。

## 兼容与回退

- 不修改用户数据 key、收藏/历史/进度/源配置/设置的存储协议。
- 播放核心、Source Adapter、Parser、Player、Session 的现有实现不重写，仅调整页面/应用编排边界。
- 若页面迁移出现回归，可回退本次提交；原业务实现未被删除，只是从启动入口拆出。

## 验收

- 架构冻结脚本必须通过。
- `npm test` 必须继续作为总门槛。
- 生产构建必须通过。
