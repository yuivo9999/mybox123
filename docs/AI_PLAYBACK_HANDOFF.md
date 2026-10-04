# AI 接力工作台：影视播放页重构

> 本文件是给下一位 / 下下一位 AI 的长期接力资料。任何 AI 开始工作前必须先读本文件；完成工作后必须更新本文件的“当前状态 / 已完成 / 未完成 / 下一步 / 验证记录”，再结束工作。
>
> 目标不是“把页面越做越复杂”，而是围绕 **内容发现 → 详情 → 播放 → 续播 → 下一集 → 推荐 → 历史/收藏** 建立稳定、清晰、可维护的闭环。

## 0. 当前工作基线

- 仓库：`yuivo9999/mybox123`
- 默认分支：`main`
- 当前接力分支：`ai-handoff/playback-phase1`
- 本轮代码最新提交：`e00b371a99bfbb60f451599dc5c5f8e12b9dae6a`
- 交接文档更新后分支 HEAD 会继续前进；以分支最新 commit 为准。
- 本轮没有合并到 `main`。
- 本轮没有删除任何核心播放模块。
- 本轮重点：修复播放入口上下文、播放返回行为、首选源导致的跨源兜底丢失。
- **不要把本轮分支直接视为最终架构完成。** 后续 AI 必须继续审计并逐步实现剩余 P1/P2。

## 1. 本轮已经完成

### 1.1 播放入口不再固定默认返回详情页

文件：`src/app/App.jsx`

以前：
- `playMovie(movie, episodeIndex, sourceId, returnRoute='detail')`
- 首页直接点“立即播放”时，如果没有显式传 returnRoute，会被记录成 detail。
- 结果：Home → 播放 → 返回，会错误地进入详情页。

现在：
- 增加 `getMovieReturnRoute(explicit)`
- 优先使用调用方显式传入。
- 否则根据当前页面推导：
  - detail → detail
  - search → search
  - movies → movies
  - home → home
- 播放请求的 `metadata.returnRoute` 保存实际上下文。

### 1.2 首选源不再删除其他候选源

文件：`src/app/App.jsx`

以前：
- 有 `preferredSource` 时，直接：
  `request.candidates = request.candidates.filter(...)`
- 这会导致“首选源失败 = 整个播放失败”，即使 B/C 源有可用候选。

现在：
- preferredSource 只负责排序优先级。
- 首选源候选放前面，其余候选保留在后面。
- 这样 PlaybackController / PlaybackCore 仍可继续执行候选兜底。
- **下一步仍需验证 playbackCore 的候选耗尽、source fallback、candidate fallback 是否真的按预期工作。**

### 1.3 播放返回入口统一

文件：`src/app/App.jsx`

增加：
`returnFromMoviePlayback()`

规则：
- returnRoute=detail → `tab=movies, route=detail, selected=当前播放 request`
- returnRoute=search → `tab=movies, route=search, selected=null`
- returnRoute=movies → `tab=movies, route=null, selected=null`
- returnRoute=home → `tab=home, route=null, selected=null`

同时用于：
- webViewRuntime 系统返回
- Android 风格右滑返回
- MovieFeature 传给 MoviePlaybackPage 的 onBack
- AppRoot 的播放页异常恢复

这样以后不能再分别修改四套播放返回逻辑。

## 2. 已确认的架构事实（不要重新调查后当成新发现）

### 2.1 VOD 播放真实入口

实际路径：

`src/app/App.jsx`
→ `playMovie()`
→ `src/services/playbackService.js`
→ `route=movie-play`
→ `src/features/movie/MovieFeature.jsx`
→ `src/features/movie/MoviePlaybackPage.jsx`
→ `playbackService.createController()`
→ `src/playback/playbackCore.js`
→ player adapter

VOD 正式页面是：

`src/features/movie/MoviePlaybackPage.jsx`

### 2.2 旧/另一套 PlaybackPage

文件：

`src/pages/PlaybackPage.jsx`

它目前主要承担 Live 播放，但文件内部仍保留大量 VOD-like 播放 UI / episode / source / progress 等逻辑。

因此当前状态是：
- VOD：MoviePlaybackPage
- Live：PlaybackPage
- LiveFeature 内还存在 inline playback / immersive playback 两种表面

**下一步必须做的是职责收敛，而不是再复制第三套播放器。**

### 2.3 Live 当前状态

`src/features/live/LiveFeature.jsx`
存在 inline 播放实现，并且可以进入 immersive `PlaybackPage`。

这不是必须立即删除：
- inline 可以保留为 PreviewPlayer
- immersive 应作为正式 LivePlaybackPage

但两个界面的“完整播放器控制逻辑”不能长期重复维护。

## 3. 当前 P1/P2 清单

### P1 — 必须优先完成

1. **统一 VOD 播放页面架构**
   - `MoviePlaybackPage.jsx` 是 VOD 正式页。
   - `pages/PlaybackPage.jsx` 中的 VOD-like 分支 / 重复逻辑需要审计后删除或抽成共享层。
   - 目标：VOD 不再存在两套完整播放 UI。

2. **提取共享 PlaybackController / hook**
   - 当前 MoviePlaybackPage 和 PlaybackPage 都自行做：
     - controller 创建
     - attach player
     - start
     - resolveAndLoad
     - progress
     - cleanup
     - retry
   - 应提取生命周期控制层。
   - 推荐目标：
     - `src/playback/PlaybackController.js`（如果现有 core 已经承担足够职责，可用 hook/provider 包装，而不是重复 core）
     - `usePlaybackController` 或 `PlaybackControllerProvider`
   - 页面只负责 context + UI。

3. **统一 PlaybackContext**
   建议结构：
   ```js
   {
     contentId,
     episodeId,
     episodeIndex,
     sourceId,
     candidateId,
     returnRoute,
     returnTab,
     startPositionSeconds
   }
   ```
   不要继续增加零散的 route 字符串 / selected 对象约定。

4. **修复续播模型**
   当前播放保存已经存在：
   - `persistent.recordProgress()`
   - contentId + episodeId + positionSeconds + duration 等
   但详情页/其他入口不能只做：
   `progress.find(item => item.contentId === contentId)`
   而应集中计算：
   - 当前内容最近观看 episode
   - 最近 position
   - completed
   - updatedAt
   - episodeIndex
   推荐新增：
   `src/services/watchProgressService.js`
   提供：
   - getEpisodeProgress()
   - getContentResume()
   - saveProgress()
   - markCompleted()
   - getContinueWatching()

5. **真正定义三层 fallback**
   - source fallback：源 A → B → C
   - candidate fallback：同一 source 的 URL/candidate
   - player engine fallback：真正支持的 player adapter
   不要把三种概念混在一个“换源”按钮里。

6. **decoderEngine UI 问题**
   `MoviePlaybackPage.jsx` 当前有：
   `const [decoderEngine, setDecoderEngine] = useState('exo')`
   并把 `onChangeDecoderEngine={setDecoderEngine}` 传入 UI。
   这看起来像可切换播放器引擎，但没有发现它真正驱动：
   - release current player
   - create another adapter
   - load
   - seek
   - resume
   - persist override
   因此当前属于“UI 看起来能切，实际不一定切”。
   **在真正实现前，优先隐藏/移除该控制，而不是继续暴露假功能。**

7. **quality / subtitle / audio**
   player interface / adapter 已有相关能力迹象：
   - getAudioTracks
   - selectAudioTrack
   - getSubtitleTracks
   - selectSubtitleTrack
   - getQualities
   - selectQuality
   下一位必须确认这些 API 的实际可用程度，再把它们放进“更多”面板。
   特别验证 HLS manifest → variants → quality selection 是否真的建立。

8. **优先源排序修复后的真实验证**
   本轮只改了 App 层排序，没有运行真实浏览器播放。
   下一位必须验证：
   - A 可用 → A 播放
   - A 失败 → B 自动接管
   - A/B 都失败 → error/retry
   - 手动切 B 后仍可切回 A
   - preferredSource 不会导致候选集合只剩一个 source

### P2 — P1 完成后做

1. 自动下一集改为：
   - 结束前显示下一集卡片
   - 倒计时
   - 立即播放
   - 取消自动播放
   - 设置项控制 autoplay
   当前 `MoviePlaybackPage.jsx` 已有 `handleVideoEnded`，所以不是“缺失 auto-next”，而是 UX 太直接。

2. 播放 UI 去重。
   当前 `MoviePlaybackPage` 同时存在：
   - TopBar 换源
   - Context Bar 选集/换源
   - PlayerWindow 内选集/换源
   - FloatingBar
   - ConsoleCard
   - Source Modal
   需要收敛成：
   - 1 个主播放器控制区
   - 1 个集数/线路入口
   - 1 个 More 面板
   不要简单继续堆按钮。

3. `SangtianPlayerConsole.jsx` 职责过宽。
   后续考虑拆成：
   - PlayerSurface
   - PlayerControls
   - EpisodePanel
   - SourcePanel
   - PlaybackMorePanel
   - PlaybackInfoPanel

4. Live：
   - inline preview = PreviewPlayer
   - immersive = LivePlaybackPage
   明确职责，不维护两套完整控制栏。

5. 历史 → 播放闭环。
   当前需要继续核查 History 页面点击历史记录时：
   - 是进入详情
   - 还是应该直接恢复对应 episode
   - 是否保留 return context
   目标是“继续观看”一键直达播放。

6. 收藏：
   确认收藏内容 → 详情 → 播放、收藏频道 → Live 播放的闭环。

### P3 — 最后做

- Sangtian terminal/workspace 命名和视觉语言统一
- 减少 inline style
- 播放页视觉密度降低
- portrait / landscape 专门 UI
- diagnostics / network metrics / direct URL 等高级信息隐藏到 Playback Info
- 最终视觉 polish

## 4. 推荐最终播放页 IA

### Portrait
1. 顶部：返回 / 片名·集数 / 更多
2. 视频
3. 进度条 + 基础播放控制
4. 当前集 / 当前线路
5. 上一集 / 选集 / 下一集
6. 收藏 / 换源 / 更多
7. 简介
8. 推荐
9. More：
   - 播放速度
   - 画面比例
   - 清晰度
   - 字幕
   - 音轨
   - 播放引擎（只有真正实现后）
   - 播放信息

### Landscape
- 视频作为绝对主角
- 控制栏最少
- 集数 / 源 / 更多进入侧抽屉
- 不要再同时出现 ConsoleCard + FloatingBar + ContextBar 三套完整控制

## 5. 不要删除的核心层

这些目前是比较好的基础，不要因为“重构”而全部推倒：

- `src/services/playbackService.js`
- `src/playback/playbackCore.js`
- `src/playback/playbackStateMachine.js`
- `src/playback/playbackResourceManager.js`
- `src/playback/playbackTaskRegistry.js`
- `src/playback/playbackSessionManager.js`
- `src/playback/playbackErrorPolicy.js`
- `src/player/playerInterface.js`
- `src/player/html5PlayerAdapter.js`
- `src/player/nativePlayerAdapter.js`
- `src/services/userDataService.js`
- `src/state/usePersistentState.js`
- `src/state/persistentStateStore.js`

这些应作为重构基础，而不是另造一个 page-local player。

## 6. 下一位 AI 开工顺序（严格按此执行）

### Step A — 先读
1. 本文件
2. `src/app/App.jsx`
3. `src/features/movie/MovieFeature.jsx`
4. `src/features/movie/MoviePlaybackPage.jsx`
5. `src/pages/PlaybackPage.jsx`
6. `src/services/playbackService.js`
7. `src/playback/playbackCore.js`
8. `src/components/theme/SangtianPlayerConsole.jsx`

### Step B — 先验证本轮
至少确认代码中：
- home → play 的 returnRoute = home
- movies → play 的 returnRoute = movies
- search → play 的 returnRoute = search
- detail → play 的 returnRoute = detail
- preferred source 被排序到前面而不是删除其他 source

### Step C — 再做 P1
优先：
1. 统一 playback context
2. 抽 controller 生命周期
3. watchProgressService
4. fallback 三层模型
5. decoderEngine 真功能 / 否则删除 UI
6. quality/subtitle/audio 接线

### Step D — 每完成一个逻辑模块
必须：
1. 更新本文件
2. 写明修改的文件
3. 写明为什么
4. 写明未完成的部分
5. 写明验证方式和结果
6. 提交一次清晰 commit

### Step E — AI 结束前必须留下接力资料
不要只说“已完成”。

必须在本文件增加：
- 当前 commit
- 当前分支
- 本轮改动
- 已验证
- 未验证
- 未完成
- 下一位第一步
- 不能重复做的工作
- 潜在回归点

如果发现新的架构事实，写进“已确认事实”。

## 7. 当前未验证事项

本轮没有浏览器真实运行验证。下一位必须优先验证：

- [ ] Home → Play → Back 回 Home
- [ ] Movies → Play → Back 回 Movies
- [ ] Search → Play → Back 回 Search
- [ ] Detail → Play → Back 回 Detail
- [ ] preferred source fail → another source fallback
- [ ] episode switching retains return context
- [ ] progress saves on 15s and unmount
- [ ] completed marks episode complete
- [ ] resume starts at correct episode/position
- [ ] next episode behavior
- [ ] source modal / player controls do not fight each other
- [ ] landscape / portrait
- [ ] native player behavior
- [ ] HLS quality / subtitle / audio capability

## 8. 接力规则

**规则 1：不要从头重新审计。**
先读本文件和最新 commit。

**规则 2：不要因为发现“播放功能很多”就继续加按钮。**
优先判断现有功能是否重复、是否真实工作。

**规则 3：不要把 UI 假功能当成已完成能力。**
尤其是 decoder engine。

**规则 4：不要破坏已有 playbackCore/state machine/resource manager。**
页面层应该越来越薄。

**规则 5：任何大重构前，先确认现有调用方。**
特别是 `playbackService.createController()` 和 `PlaybackPage` / `MoviePlaybackPage` 的关系。

**规则 6：停止工作前必须更新本文件。**
这条是无限接力的核心。

---

## 13. 本轮继续完成：P1.5 fallback 三层语义

### 13.1 已确认的真实问题
检查 src/services/playbackService.js 与 src/playback/playbackCore.js 后确认：
- 之前候选是一个平面队列，自动失败只按数组顺序寻找下一个 candidate。
- “同 source candidate fallback”和“跨 source fallback”没有显式语义。
- 自动失败后的候选会进入 failedCandidates，原 switchCandidate() 会拒绝再次选择失败 candidate。
- Native bridge 可用时直接选择 Native；Native 播放失败后原流程没有独立的 player-engine fallback。

### 13.2 已完成修改
文件：src/services/playbackService.js
- createPlaybackTask().next() 现在先尝试同 source 的未失败、未过期 candidate。
- 同 source 候选耗尽后才跨 source。
- sourceChanged 事件附带 fallbackLevel=candidate 或 fallbackLevel=source。
- 手动 switchCandidate() 会清除该 candidate 的自动失败标记，因此用户可以手动重新尝试此前失败的 candidate；已过期 candidate 仍拒绝。

文件：src/playback/playbackCore.js
- 记录当前 player engine：native / html5。
- Native 播放出现 network/player/unsupported 类失败，并且存在 HTML5 video element 时，先 release Native，再对同一 candidate 创建 HTML5 adapter 并重新 resolve/load/play。
- engine fallback 成功则不进入换源；失败后才继续 retry → candidate/source fallback。
- 发出 playerEngineChanged(engine=html5, reason=native-fallback)。
- 每个 controller 生命周期只尝试一次 engine fallback，避免循环。

### 13.3 三层责任边界
player engine fallback：同一 candidate / 同一 resolved media，换播放器实现。
candidate fallback：同一 source，换另一个 candidate / URL。
source fallback：当前 source 候选耗尽后，换其他 source。
不要把三层继续合并成一个“换源按钮”。

### 13.4 本轮验证
已做静态回读确认：
- playbackService.js 已包含同源优先、跨源其次。
- 手动 switchCandidate() 可以重新尝试此前自动失败的 candidate。
- playbackCore.js 已包含 Native → HTML5 engine fallback。
- 原有 parser / retry / exhausted 流程仍保留。

尚未验证：
- 浏览器真实播放
- Native bridge 真实失败后 HTML5 接管
- A source 多 candidate 全失败后是否真实进入 B source
- HLS parser failure 是否按预期进入 candidate/source fallback
- build / lint / test

### 13.5 下一位 AI 第一任务
不要重新做 fallback 架构调查。
1. 静态检查本轮两个文件。
2. 如果能运行项目，优先验证 A1→A2、A1/A2→B1、失败 A1 手动重新选择、Native→HTML5。
3. 修复验证中发现的实际问题。
4. 然后进入 P1.6：decoderEngine 假 UI。当前 MoviePlaybackPage.jsx 仍有 decoderEngine local state；如果不能真正驱动 adapter 切换，就先隐藏/移除 UI，不要制造假功能。
5. P1.6 后进入 P1.7：quality / subtitle / audio 能力接线。

### 13.6 不能重复的工作
Home / Movies / Search / Detail 返回上下文、preferred source 保留其他候选、shared usePlaybackController、watchProgressService、以及本轮三层 fallback 基础责任划分均已完成。

### 13.7 潜在回归点
- usePlaybackController 不要因 request identity 每次 render 变化而重建 controller。
- Native fallback 依赖 HTML5 video element。
- HTML5 quality selection 仍依赖 resolved input 中已有 manifest.variants，尚未确认 parser 是否稳定提供。
- 自动 fallback 与 Live reconnect 是不同语义，Live 仍优先使用 reconnect policy。

## 14. 当前接力状态（最新）

- 当前分支：ai-handoff/playback-phase1
- 当前 HEAD：2c610378e7a8e678f73747db9573427230b9621d
- 相对 main：ahead 19 / behind 0
- 本轮最新提交：document P1.5 playback fallback handoff
- 尚未合并 main，也没有创建最终合并 PR。

### 本轮已实际修改
- src/services/playbackService.js
  - 同 source candidate fallback 优先。
  - source fallback 次之。
  - 手动重新选择曾自动失败的 candidate 时解除失败锁。
- src/playback/playbackCore.js
  - 增加 Native → HTML5 engine fallback。
- docs/AI_PLAYBACK_HANDOFF.md
  - 已记录 P1.5 责任边界、验证状态和下一步。

### 本轮未验证
- 没有浏览器真实播放环境验证。
- 没有运行 npm build / lint / test。
- 没有真实 Native bridge。
- 没有真实 A1/A2/B1 故障注入。

### 下一位 AI 开始时的第一步
1. 读取本文件。
2. 不重新审计 P1.5 架构。
3. 能运行项目时先做故障注入/真实播放验证。
4. 若 P1.5 无实际回归，直接进入 P1.6：处理 MoviePlaybackPage 的 decoderEngine 假 UI。
5. P1.6 完成后更新本文件并进入 P1.7 quality / subtitle / audio。

### 重要回归提醒
- 不要把 player engine fallback 当 source fallback。
- 不要让手动换源因为历史自动失败状态而失效。
- 不要在没有真实底层能力时继续增加 decoderEngine UI。
- 继续保留本文件作为下一位 AI 的唯一接力入口。


## 15. P1.6 已完成：移除 decoderEngine 假 UI

### 已确认
MoviePlaybackPage 原本维护 decoderEngine local state，并把 ExoPlayer / IJKPlayer / Native / HTML5 四个选项展示给用户；但页面状态只改变 React state，没有通过 PlaybackCore/player adapter 完成真正的 engine release → recreate → load → seek → resume。

因此这个控制属于假功能。

### 已修改
- src/features/movie/MoviePlaybackPage.jsx
  - 删除 decoderEngine local state。
  - 删除向 SangtianPlayerWindow 传递 decoderEngine / onChangeDecoderEngine。
- src/components/theme/SangtianPlayerConsole.jsx
  - 删除 VOD 全屏“解码内核 (Decoder Engine)”选择区。
  - 保留现有真实播放引擎 fallback：Native 失败时 PlaybackCore 可自动尝试 HTML5。
  - 不再向用户承诺当前页面可以手动选择 Exo/IJK/Native/HTML5。

### 验证
静态回读确认：
- MoviePlaybackPage 不再声明 decoderEngine state。
- MoviePlaybackPage 不再传 decoderEngine / onChangeDecoderEngine。
- SangtianPlayerWindow 不再定义 decoderEngine / onChangeDecoderEngine props。
- SangtianPlayerConsole 不再渲染 decoder engine 选择按钮。

尚未运行：
- npm build / lint / test
- 浏览器真实播放
- Native bridge

### 下一步
进入 P1.7：quality / subtitle / audio。

顺序：
1. 先确认 parserService 对 HLS/DASH resolved input 是否实际携带 manifest / variants / audio / subtitle 信息。
2. 再确认 HTML5 adapter 的 track API 在实际浏览器中可用程度。
3. Native adapter 当前 audio/subtitle/quality 能力虽有方法，但 capabilities 明确标记为 false；不能直接在 UI 中假设 Native 支持。
4. 只把真实可用能力接进 More 面板。
5. 若某能力只是“API 形状存在但后端/浏览器不支持”，宁可隐藏，不要展示假按钮。

### P1.6 潜在回归点
- 不要为了恢复 decoderEngine UI 而重新添加 local state。
- 如果未来真的实现手动 engine switching，必须走 PlaybackCore/controller，并保存 position 后切换 adapter，再恢复 position/playback。



## 16. P1.7 已完成：真实 quality / subtitle / audio 接线

### 16.1 先确认的能力边界
本轮没有把 parser 中的 `manifest.variants` 当成已经稳定可用的清晰度来源。实际确认：
- HLS parser 默认不会主动抓 manifest，`fetchManifest` 未开启时 resolved input 可能没有 `manifest`。
- HTML5 播放实际使用 hls.js，因此最可靠的 HLS 清晰度/音轨/字幕来源是 hls.js 当前实例的 `levels` / `audioTracks` / `subtitleTracks`。
- Native adapter 已有对应桥接方法，但 capabilities 明确标记 AUDIO_TRACKS / SUBTITLE_TRACKS / QUALITY_SELECTION=false，因此 VOD 页面不会因为 Native API 存在就误显示这些控件。
- 原生 HTML5 `audioTracks` / `textTracks` 仍作为非 HLS fallback。

### 16.2 已修改
文件：`src/player/html5PlayerAdapter.js`
- capabilities 动态暴露真实 HLS 能力：
  - audioTracks
  - subtitleTracks
  - trackSelection
  - qualitySelection
- HLS audio tracks 通过 hls.js `audioTracks` / `audioTrack` 接线。
- HLS subtitles 通过 hls.js `subtitleTracks` / `subtitleTrack` / `subtitleDisplay` 接线，并提供“关闭字幕”。
- HLS quality 通过 hls.js `levels` / `currentLevel` 接线。
- 非 HLS 继续使用浏览器原生 track API；若存在 parser manifest variants，也保留 variants fallback。
- 未增加新的“假清晰度/假字幕/假音轨”状态。

文件：`src/features/movie/MoviePlaybackPage.jsx`
- 将 PlaybackCore 暴露的 capabilities 和 track/quality API 传入播放窗口。
- 页面本身不复制播放器状态。

文件：`src/components/theme/SangtianPlayerConsole.jsx`
- 全屏右侧播放设置增加条件式：
  - 清晰度
  - 音轨
  - 字幕
- 只有底层 capability + 实际列表存在时才显示。
- 控件通过真实 adapter API 操作，不再维护假状态。
- track/quality 查询失败时隐藏对应区域。

### 16.3 当前语义
- Native 播放：由于 native capabilities 当前明确为 false，这三个控件隐藏。
- HLS + hls.js：有多个 levels/audio/subtitle 时显示对应控件。
- 单清晰度 / 没有音轨 / 没有字幕：对应区域不显示。
- 选择清晰度时优先使用 hls.js level 切换，不再直接替换 HLS master URL。
- 字幕支持关闭。

### 16.4 验证
已做静态回读：
- html5 adapter 已存在 HLS level/audio/subtitle 的真实读写路径。
- MoviePlaybackPage 已把 controller API 接到 SangtianPlayerWindow。
- SangtianPlayerConsole 只在 capability + 数据存在时渲染对应控件。
- Native adapter 未被错误标记为支持这些能力。

尚未验证：
- [ ] 浏览器真实 HLS master playlist 多清晰度切换
- [ ] 浏览器真实 HLS 多音轨切换
- [ ] 浏览器真实 HLS 字幕切换/关闭
- [ ] Native bridge 实际返回 track/quality 数据
- [ ] build / lint / test
- [ ] 移动端竖屏/横屏真实 UI

### 16.5 下一步
P1.7 之后不要继续堆播放按钮。下一优先级是 P1.8：
1. 审计并收敛 `src/pages/PlaybackPage.jsx` 中残留的 VOD-like 完整播放职责。
2. 确认 Live 的 inline preview 与 immersive PlaybackPage 哪些控制可共享，避免删除 Live 所需能力。
3. 目标是 VOD 只有 `MoviePlaybackPage` 一套正式播放页，Live 保留正式 immersive 页但共享 controller/基础控制。
4. 在完成职责收敛后，再做 P2 的控制栏去重和自动下一集 UX。

### 16.6 潜在回归点
- hls.js 的 audio/subtitle/level 能力只在 HLS 实例真正加载并暴露对应 tracks 时存在；不能用 capability 名称代替真实列表。
- 不要把 Native capabilities 改成 true，除非 bridge 契约和实际返回数据已经确认。
- qualityId 当前对应 hls.js level index；切换时由 hls.js 保留 master playlist 语义。
- 未来若引入跨 adapter 的统一 Track/Quality model，必须保持当前“能力不存在就隐藏”的原则。


### 16.7 当前接力状态
- 当前分支：`ai-handoff/playback-phase1`
- 当前 HEAD：`1427fac917aac47a8abb1b94d67bbe5bab775c1d`
- 相对 `main`：ahead 27 / behind 0
- 本轮最新逻辑模块：P1.7 quality / subtitle / audio
- 本轮文档已同步到本 commit。
- 尚未合并 `main`，也没有创建最终合并 PR。

### 本轮未验证
- 没有浏览器真实播放环境。
- 没有运行 npm build / lint / test。
- 没有真实 HLS 多清晰度、多音轨、多字幕故障/切换验证。
- 没有真实 Native bridge 验证。

### 下一位 AI 第一任务
1. 读取本文件，不重新调查 P1.5/P1.6/P1.7 已确认事实。
2. 进入 P1.8：审计 `src/pages/PlaybackPage.jsx` 的 VOD-like 逻辑与 Live 真实调用关系。
3. 删除/抽取重复 VOD UI 前，先确认 `LiveFeature.jsx`、`PlaybackPage.jsx` 的所有调用方，确保 Live immersive 不被误删。
4. 每完成一个逻辑模块继续更新本文件并提交。

### 不能重复的工作
- 不要重新设计 fallback 三层模型。
- 不要重新实现 watchProgressService。
- 不要重新添加 decoderEngine 假 UI。
- 不要把 Native 的 track/quality capabilities 改成 true，除非有实际 bridge 契约证据。
- 不要把 quality/audio/subtitle 再复制成 page-local 播放状态。

### 潜在回归点
- HLS 控件依赖 hls.js 实例实际暴露 tracks/levels。
- MoviePlaybackPage 仍有重复的选集/换源入口，P2 再做 UI 收敛。
- `usePlaybackController` 仍可能因 request identity 变化而重建 controller，这是后续应验证的生命周期风险。
