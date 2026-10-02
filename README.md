# TVBox React v0.3.0

这是依据 `TVBox React` 01～09 架构文档，在 `tvbox竖屏后续/10～12` 已完成施工成果上，按 `tvbox竖屏后续/13_播放候选与播放链路改造实施方案.md` 完成的第一次 Playback Candidate / 播放链路施工升级。

## 本次升级：12_Live直播源适配层

### 已完成
- 建立独立 `Live Adapter` 层，Live 页面不负责解析 M3U / JSON / XML。
- 建立统一 Adapter 契约：`getChannels()`、`getCategories()`、`getStreams(channelRef)`、`getEPG(channelRef, range)`、`healthCheck()`。
- 建立 `LiveRegistry`，支持按 `sourceId` 注册、查询、移除 Adapter。
- 建立 M3U、JSON、XML/EPG Parser，并把格式差异限制在 Adapter/Parser 边界内。
- 标准化 `channelId`、`sourceChannelId`、`streamId` 和独立 `programId`。
- Stream 增加 `protocol / headers / cookies / referer / userAgent` 等播放上下文，为后续 PlaybackCandidate 施工保留边界。
- 支持显式 `channelKey` 的多源频道合并；未提供映射时保留原有 `sourceId + sourceItemId` 频道身份，避免破坏已有收藏/历史关联。
- 同一频道可保留多个 `sourceRefs` 与多个 `streams`；单源失败通过 `Promise.allSettled` 隔离。
- EPG 与 Channel 解耦；没有 EPG 不影响频道和 Stream；EPG 按范围查询，失败不会主动清空既有快照。
- 保留上一阶段 `v2` Storage、用户数据与 Source Config 边界，不修改收藏/历史/进度的持久化键空间。

### 本阶段明确不做
- 不把 Live Channel 改造成影视 Episode。
- 不实现最终 Playback Core / Parser / Player Adapter。
- 不删除旧 Live 数据模型或旧 UI 入口。
- 不把短生命周期 Token/Cookie 写入用户持久数据。


## 本次升级：13_播放候选与播放链路

### 已完成
- 建立统一 `PlaybackCandidate`：VOD 与 Live 共享 `mediaUrl / sourceId / streamId / contentId / episodeId / channelId / protocol / headers / cookies / referer / userAgent / token / expiresAt / parserHint / playerHint / priority / metadata` 边界。
- 兼容旧 Live `url` 字段，但播放层只消费规范化后的 `mediaUrl`。
- 建立 `PlaybackRequest`：固化 `requestId / taskId / kind / candidates / primaryCandidateId / fallbackCandidateIds`，播放页不再自行拼接播放 URL。
- 建立 `PlaybackTask`：候选快照、当前候选、失败候选记录、短重试、下一候选、手动切源、停止和释放。
- 建立 `PlaybackCore` 边界；本阶段只负责播放任务编排，不提前实现 Parser / Player Adapter，给 14/15 保留稳定插口。
- VOD Episode 可以携带多个 `playbackCandidates`；Live Stream 在进入播放时转换为统一 `PlaybackCandidate`。
- 页面播放入口改成 `PlaybackService → PlaybackRequest → PlaybackCore`，Live/VOD 共用同一播放任务入口。
- 候选失败会留下 `candidateId` 和错误分类，并禁止重复选择已失败候选，避免无限 fallback。
- React 播放页面在卸载时执行 stop/release，避免旧播放任务继续持有运行时资源。

### 本阶段明确不做
- 不实现最终 Parser / Parser Chain。
- 不实现最终 Player Adapter / Player SDK。
- 不把短生命周期 Token/Cookie 写入用户持久数据。
- 不修改收藏、历史、进度的身份键空间。
- 不把 Live Channel 改造成影视 Episode。

## 目录

```text
src/
├── adapters/
│   └── live/
│       ├── liveAdapter.js
│       ├── liveRegistry.js
│       ├── liveTypes.js
│       ├── normalizeLive.js
│       ├── m3uParser.js
│       ├── jsonParser.js
│       └── xmlParser.js
├── data/
├── models/
├── repositories/
├── services/
├── storage/
├── styles/
└── main.jsx
```

## Adapter 契约

```text
Live Source
  ↓
Live Adapter
  ├─ M3U Parser
  ├─ JSON Parser
  └─ XML / EPG Parser
  ↓
Normalized Channel / Stream / EPG
  ↓
LiveService
  ↓
Live Page / 后续 Playback 层
```

## 多源频道规则

推荐外部源提供稳定 `channelKey`：

```text
Source A ── channelKey=cc1 ──┐
                             ├─ Channel(channel: key:cc1)
Source B ── channelKey=cc1 ──┘
```

如果源没有明确映射，则不猜测跨源同频道关系，而保留源内身份，避免错误合并用户数据。

## 验证

```bash
npm run test
npm run build
```

本交付环境没有安装 `node_modules`，因此 `npm run build` 无法在本地执行；本次已执行 Live Parser/多源合并测试、Playback Candidate/Task 生命周期测试以及新增 JS 模块语法检查。最终 ZIP 保留标准 `npm run build` 脚本，后续可在有依赖的环境中直接构建。
