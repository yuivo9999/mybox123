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


## 16. P1.8 已完成：PlaybackPage 收敛为 Live-only

### 16.1 已确认调用链
本轮实际回读确认：
- `src/app/App.jsx` 只有 `route === 'live-play'` 两处渲染 `<PlaybackPage ... kind="live" />`。
- `route === 'movie-play'` 完全进入 `src/features/movie/MovieFeature.jsx` → `MoviePlaybackPage.jsx`。
- `MovieFeature.jsx` 的 Home / Search / Detail / Continue Watching 播放入口全部调用 `onPlay`，最终由 App 的 `playMovie()` 进入 `movie-play`。
- 因此 `src/pages/PlaybackPage.jsx` 中原来的 VOD 分支已经没有调用方，删除是安全的。

### 16.2 已修改
文件：`src/pages/PlaybackPage.jsx`
- 删除 `movieService` 与所有 Movie / Episode / VOD metadata 派生逻辑。
- 删除 VOD-only FloatingBar、上下集、选集、电影详情、相关影视等 UI。
- 删除 `decoderEngine` 假状态及其 props。
- 页面现在只维护 Live：
  - 当前频道 / EPG
  - Live candidate / source 切换
  - Live player
  - Live console
  - 收藏频道
  - 画中画
  - Live 线路 modal
- 继续复用 `usePlaybackController`，不复制底层 controller 生命周期。
- 修正 Live player 内“上一条/下一条线路”按钮：组件回调传 index，页面先映射到 candidateId 再调用 controller。
- 不再让 Live 页面携带 episode/source 混合语义。

### 16.3 架构结论
当前正式播放入口已经明确为：
- VOD：`src/features/movie/MoviePlaybackPage.jsx`
- Live immersive：`src/pages/PlaybackPage.jsx`

暂时没有重命名为 `LivePlaybackPage.jsx`，原因是当前 App 仍直接引用 `PlaybackPage`；本轮先做职责收敛，避免同时引入路径迁移噪声。后续如果需要命名统一，可以单独做文件重命名 + import 更新。

### 16.4 本轮验证
已完成静态调用链回读：
- `App.jsx` 的 movie-play → MovieFeature → MoviePlaybackPage。
- `App.jsx` 的 live-play → PlaybackPage(kind=live)。
- `MovieFeature.jsx` 的 Home/Search/Detail 播放入口均进入 `playMovie()`。
- SangtianPlayerWindow 的 `onSwitchStreamIndex` 确认传入的是 index，因此已修正 PlaybackPage 的映射。
- 本轮没有运行浏览器真实播放。
- 本轮没有运行 npm build / lint / test。
- Native bridge / HLS / EPG 仍未做真实环境验证。

### 16.5 下一步
P1.8 后不要再回头审计“PlaybackPage 是否还承担 VOD”——本轮已经确认并删除。
下一优先级进入 P1.9 / P2：
1. 稳定 `usePlaybackController` 的 request 生命周期，避免 request object identity 变化导致 controller 不必要重建。
2. 收敛播放页重复控制：TopBar / PlayerWindow / ConsoleCard / source modal 之间只保留一套主入口。
3. 自动下一集改成倒计时 + 取消，而不是结束立即跳转。
4. Live inline preview 与 immersive PlaybackPage 的职责继续拆清：inline 只负责 Preview，不复制完整控制栏。
5. 若要改名，`PlaybackPage.jsx` → `LivePlaybackPage.jsx` 单独处理，不和 UI 重构混在一起。

### 16.6 不能重复的工作
- VOD 已确认不再使用 `src/pages/PlaybackPage.jsx`。
- decoderEngine 假 UI 已移除。
- MoviePlaybackPage 已接管 VOD playback。
- usePlaybackController 已作为 VOD / Live 共用生命周期包装层。
- P1.5 三层 fallback、P1.4 watchProgressService、P1.7 quality/subtitle/audio 基础接线不要重新实现。

### 16.7 潜在回归点
- `PlaybackPage.jsx` 当前仍沿用旧文件名；任何新代码不要把它误认为 VOD 页面。
- `SangtianPlayerWindow` 的 Live stream prev/next 回调参数是 index，不是 candidateId。
- Live 的 HLS/native 能力仍受底层 adapter 实际能力限制。
- `usePlaybackController` request identity 生命周期问题尚未处理。
- 本轮未运行真实播放器、build、lint、test。


## 17. P1.9 已完成：稳定 usePlaybackController 的 request 生命周期

### 17.1 问题
原 `usePlaybackController` 直接把 `request` 对象放进 `useMemo(createController)` 依赖。
如果上层每次 render 产生新的 request object，即使实际播放内容、episode、candidate 都没变，也会重新创建 controller，触发重新 attach/start/load/leave。

### 17.2 已修改
文件：`src/playback/usePlaybackController.js`
- 增加 `getPlaybackRequestKey()`，按真正影响播放生命周期的字段建立语义 key：
  - contentId
  - episodeId
  - channelId
  - startPositionSeconds
  - candidateId/sourceId/mediaUrl/protocol
- controller 创建依赖从完整 request identity 改为 `requestKey + isLive`。
- 用 requestRef 保存当前语义 request，避免 controller 因 UI render object identity 变化而重建。
- recordProgress 改用 ref，不再因为回调 identity 变化重建 controller。
- requestKey 真正变化时重置 progressRef，避免不同 episode 继承上一集的进度缓存。
- cleanup / progress callback 读取 requestRef，保证 controller 生命周期结束时使用当前语义 request。

### 17.3 静态验证
已回读确认：
- request object 每次 render 但语义不变时，不再进入 createController 的依赖。
- episode/source/candidate 真正变化时 requestKey 改变，controller 会重新建立生命周期。
- progressRef 在 requestKey 改变时清零。
- 本轮仍未运行浏览器、build、lint、test。

### 17.4 下一步
进入 P2 播放 UI 去重：
1. 先梳理 TopBar / PlayerWindow / ConsoleCard / Source Modal 各自实际承担的交互。
2. 不直接删除控件；先建立“唯一入口”规则：
   - 播放基础控制只在 PlayerWindow
   - 线路只保留一个显式入口
   - Live 频道切换与 VOD 选集分开
   - More / diagnostics 不放主控制栏
3. 再做自动下一集 countdown/cancel。


## 18. P2.1 已完成：Live 线路入口去重

### 修改
文件：`src/components/theme/SangtianPlayerConsole.jsx`
- 删除 Live ConsoleCard 内重复的“当前线路”快捷 chips。
- Live 线路现在由播放页的统一 source modal 承担选择入口；TopBar workspace 打开该 modal。
- ConsoleCard 的 Live 标签页专注频道切换，不再同时承担第二套线路选择器。
- 没有删除底层 `onSelectCandidate` 能力，也没有改变 controller 的 source/candidate fallback。

### 为什么这样做
原 Live 播放页同时存在：
1. TopBar → source modal
2. ConsoleCard → 当前线路 quick chips
3. PlayerWindow 的线路前后切换
三者都能改同一个 candidate，容易造成“多个入口同时控制同一状态”的 UI 竞争。

本轮只去掉第 2 项，保留：
- 播放器内上一/下一线路快捷切换
- 一个完整 source modal
这样基础操作和完整线路选择各有一个明确入口。

### 未做
- VOD 的 source / episode 多入口还没有全部收敛。
- TopBar / ConsoleCard / PlayerWindow 的更深层职责拆分还没有开始。
- 没有运行浏览器、build、lint、test。

### 下一步
继续 P2：
1. VOD 选集 / 换源入口去重。
2. 自动下一集改为 countdown + cancel。
3. 再考虑把 `PlaybackPage.jsx` 重命名为 `LivePlaybackPage.jsx`，作为独立小提交。


## 18. P2.2 已完成：VOD 选集 / 换源入口去重

### 18.1 已确认的重复
VOD 播放页此前同时暴露：
- TopBar 的“集数 / 换源”入口；
- 播放上下文栏的“选集/换源”入口；
- ConsoleCard 下方完整 EPISODES 选集网格；
- 全屏模式的选集侧栏与线路设置；
- 页面级“选择播放源与集数”modal。

这些入口并非都属于同一种上下文：页面级入口负责普通浏览，fullscreen 侧栏负责全屏状态下不离开播放器的操作。因此本轮没有把所有入口机械删除，而是收敛“普通页面”的主入口。

### 18.2 已修改
文件：src/features/movie/MoviePlaybackPage.jsx
- 删除播放上下文栏重复的“选集/换源”按钮。
- 保留 TopBar 的“集数”入口作为普通页面的主 selector trigger。
- 保留上下文栏上一集 / 下一集作为线性播放快捷操作。
- 清理因此失去用途的 ListVideo import。

文件：src/components/theme/SangtianPlayerConsole.jsx
- VOD 的 ConsoleCard 不再渲染完整 episode grid。
- VOD ConsoleCard 默认进入“信息”视图，只显示当前播放集提示与内容信息/相关推荐。
- Live ConsoleCard 仍保留频道分类与频道选择，不受本次 VOD 去重影响。
- 全屏模式仍保留选集侧栏，因为全屏时页面级 modal 不是可靠的主要操作面；这属于“全屏上下文快捷入口”，不是普通页面的第二套 selector。
- VOD 全屏线路设置仍可切换 candidate，因为它属于全屏内的播放设置上下文。

### 18.3 当前 VOD IA
普通页面：
1. TopBar “集数” → 打开统一的“选择播放源与集数” modal（主入口）
2. 播放上下文栏 → 上一集 / 下一集（线性快捷操作）
3. 播放窗口 → 基础播放 / 全屏 / More 设置
4. ConsoleCard → 播放信息 / 相关推荐，不再复制选集列表

全屏：
- 选集侧栏作为 fullscreen 内的上下文快捷入口
- 线路设置作为 fullscreen 内的播放设置入口

### 18.4 验证
已做静态代码回读：
- MoviePlaybackPage 的普通页面“选集/换源”重复按钮已移除。
- ConsoleCard 的 VOD episode grid 已移除；Live channel grid 保留。
- VOD fullscreen episode/source controls 仍有实际 callback，不是死 UI。
- 本轮没有运行浏览器、npm build、lint、test。

### 18.5 下一步
直接进入 P2.3：自动下一集 UX。
当前 MoviePlaybackPage.handleVideoEnded 已经存在自动下一集能力，但它是“播放结束立即跳下一集”。下一步改为：
- 结束后显示下一集提示卡；
- 5 秒倒计时；
- “立即播放”；
- “取消自动播放”；
- 尊重现有 autoplay/resume 设置（如果设置语义已存在则复用，不新造第二套设置）。

### 18.6 潜在回归点
- 不要删除 fullscreen 选集入口后再要求用户退出 fullscreen 才能选集。
- 不要重新把 ConsoleCard episode grid 加回来。
- 普通页面 selector 的唯一主入口仍应是 TopBar 的“集数”入口及其 modal。
- 上一集 / 下一集按钮是线性导航，不算第二套 episode selector。


## 19. P2.3 已完成：自动下一集倒计时 / 取消

### 19.1 已确认的旧行为
`MoviePlaybackPage.jsx` 原本已经存在 auto-next：视频结束后直接调用 onEpisode 进入下一集。
因此本轮不是“补上 auto-next”，而是把现有行为从无提示的立即跳转改成可控 UX。

### 19.2 设置语义
现有 `autoplayResume` 只控制“进入播放时是否从保存进度续播”，不能拿来表示下一集自动播放。
因此新增独立设置：
- `autoplayNext`：是否允许下一集倒计时自动播放；默认 true。
- 设置页新增“自动播放下一集”开关。
- 两个开关互不覆盖，避免用户关闭续播却意外关闭 auto-next，或反之。

### 19.3 播放结束行为
文件：src/features/movie/MoviePlaybackPage.jsx
- 当前集不是最后一集时，结束事件只打开下一集提示，不再立即跳转。
- `autoplayNext !== false`：显示 5 秒倒计时。
- 倒计时到 0：自动进入下一集。
- “立即播放”：跳过倒计时直接进入下一集。
- “取消”：关闭本次自动播放，不进入下一集。
- `autoplayNext === false`：不倒计时，但仍显示下一集卡片，用户可以手动“立即播放”。
- 切换到新的 episode request 时清理旧的下一集倒计时，避免旧 timer 污染新集。
- 最后一集不显示下一集卡片。

### 19.4 已修改文件
- src/models/userData.js：新增 defaultSettings.autoplayNext。
- src/pages/MainPage.jsx：设置页新增“自动播放下一集”。
- src/features/movie/MoviePlaybackPage.jsx：增加 nextEpisodeCountdown、timer cleanup、立即播放/取消 UI。

### 19.5 验证
已做静态代码回读：
- 旧的结束即跳转逻辑已替换为 countdown state。
- timer 在倒计时结束时调用统一 playNextEpisode。
- cancel 会清除 countdown，不调用 onEpisode。
- autoplayNext=false 不会自动跳集，但仍保留手动下一集能力。
- 本轮没有运行浏览器、npm build、lint、test。

### 19.6 下一步优先级
P2.3 后进入 P2.4：继续收敛 `SangtianPlayerConsole.jsx` 的职责与重复控制，但不要大拆组件导致播放行为回归。
优先审计：
1. VOD 普通页面 TopBar / PlayerWindow / FloatingBar / ConsoleCard 是否还有重复的播放控制。
2. fullscreen 内“选集 / 线路 / 播放设置”是否可以统一为一个 More 侧栏入口。
3. diagnostics、直链、网络指标等高级信息是否应从主播放 UI 移入 Playback Info。
4. 然后再处理 Live inline preview 与 immersive PlaybackPage 的控制职责。

### 19.7 潜在回归点
- 不要把 autoplayNext 与 autoplayResume 合并。
- 不要让倒计时 timer 在 episode 已经切换后继续触发旧 onEpisode。
- 不要删除最后一集的无意义下一集卡片。
- 不要重新恢复 ConsoleCard 的 VOD episode grid。


### 19.8 静态回读修正
在 P2.3 后的低风险死参数清理中，ConsoleCard 的自动文本替换曾短暂命中 section eyebrow 内部；随后已立即重建整个 Episodes 区块并提交修正。
当前结构已恢复为：section header → Live channel selector / VOD 当前播放提示 → Tab 2 信息区。
这次回归仅发生在提交脚本的文本替换阶段，未声称已通过 build/lint；因此后续第一验证动作仍应是运行 lint/build 或至少 JSX 编译检查。

当前最新代码提交：1360b933f6c0d85f25e0c3152c5bc8766629ea9a
当前分支：ai-handoff/playback-phase1
相对 main：ahead 49 / behind 0
尚未合并 main，也没有创建最终合并 PR。


## 20. P2.4 第一小步已完成：移除不可达诊断 UI

### 20.1 已确认问题
`SangtianPlayerWindow` 曾维护 `showTerminal`，但全文件只有 `setShowTerminal(false)`，没有任何 `setShowTerminal(true)` 入口；因此“播放信息终端”实际上无法从 UI 打开。
全屏底部还直接展示缓冲百分比、加载速率、网络估速等高级诊断指标，与“视频为主、诊断收进 More / Playback Info”的目标冲突。

### 20.2 已修改
文件：src/components/theme/SangtianPlayerConsole.jsx
- 删除不可达 `showTerminal` 状态及终端面板分支。
- 删除无入口的 Terminal 图标依赖。
- 从全屏主控制栏移除缓冲 / 加载 / 网络诊断指标。
- 保留播放器内部的 buffer 采样基础逻辑，后续如果建立真正的 Playback Info 面板，可重新接入；没有伪造新的入口。

### 20.3 验证
静态回读确认：
- `showTerminal` 不再存在。
- 全屏主栏不再直接显示诊断指标。
- 正常视频 children / loading / error / fullscreen control 结构仍保留。
- 本轮没有运行浏览器、npm build、lint、test。

### 20.4 下一步
P2.4 下一小步：审计 fullscreen 的“选集 / 线路设置 / More 设置”是否可以合并成更清晰的一个侧栏 IA，同时保持全屏状态下无需退出播放器即可操作。


### 20.5 终端面板残留修正
第一次删除诊断三元分支后，静态回读发现终端面板本体仍残留；已立即删除该不可达块，并再次检查 `showTerminal` / `setShowTerminal` / terminal panel / fullscreen metrics 均不存在。
当前最新代码提交：3b31211378fcd53af68621676b8434c2d29cfd31
本轮仍未运行 build/lint/test；下一次验证优先级为 JSX 编译 / lint。


## 21. P2.4.2 已完成：统一全屏右侧播放面板

### 21.1 本轮确认的问题
文件：`src/components/theme/SangtianPlayerConsole.jsx`

全屏 VOD 原本维护两套右侧侧栏：
- “剧集选集”侧栏：只负责 episode grid，并额外包含线路。
- “线路与播放设置”侧栏：负责画面比例、清晰度、音轨、字幕、线路。

两者都是同一个“播放过程中打开的右侧工作面板”，却由两个 state 和两个 JSX 分支维护，容易造成：
- 同一条线路在不同面板重复出现。
- 选集和线路入口分裂。
- 后续增加播放速度/更多设置时继续产生第三套入口。

### 21.2 已实际修改
仍只修改：
- `src/components/theme/SangtianPlayerConsole.jsx`

具体：
- 删除 `showEpisodeSidebar`，改为单一 `showRightSidebar` + `rightSidebarSection`。
- “选集”按钮只切换右侧面板到 `episodes` 区域。
- “更多”按钮只切换右侧面板到 `settings` 区域。
- 两个入口现在共用同一个右侧面板容器。
- VOD 选集区域保留：分组、集数选择、播放线路。
- VOD 播放设置区域保留：播放速度、画面比例、清晰度、音轨、字幕、播放线路。
- Live 继续保留左侧“选台”与右侧“播放与解码设置”，没有把 Live 频道选择错误并入 VOD episode IA。
- 全屏设置入口从“线路设置”改名为“更多”，避免把 More 面板误解成单纯换源功能。

### 21.3 当前信息架构
Landscape VOD：
- 顶部：返回 / 当前标题 / 选集 / 更多 / 锁定 / 时间 / 退出。
- 选集：同一右侧播放面板的 episode 区域，同时允许选线路。
- 更多：同一右侧播放面板的 playback settings 区域。
- 底部：进度、上一集、下一集、倍速、比例、退出。

因此目前没有再增加第三套“播放设置”入口。

### 21.4 静态验证
已回读当前文件确认：
- `showEpisodeSidebar` 不再存在。
- `setShowEpisodeSidebar` 不再存在。
- 全屏只保留一个 `showRightSidebar` 右侧面板。
- 选集入口使用 `rightSidebarSection='episodes'`。
- 更多入口使用 `rightSidebarSection='settings'`。
- 播放速度已进入统一 More 面板。

尚未验证：
- 浏览器真实全屏交互。
- 移动端横竖屏真实行为。
- build / lint / test。

### 21.5 下一步
继续按优先级进入 P2.5 / Live 播放职责收敛：
1. 审计 `LiveFeature.jsx` 的 inline preview 与 `PlaybackPage.jsx` immersive 播放控制是否重复。
2. 目标是 inline = 轻量 PreviewPlayer，immersive = 正式 LivePlaybackPage；共享底层 controller，不再复制完整控制逻辑。
3. 在没有必要之前，不要继续往 `SangtianPlayerConsole.jsx` 增加新的入口。

### 21.6 接力状态
- 当前分支：`ai-handoff/playback-phase1`
- 本轮代码提交：`b85513fce64ea8696986fca095fb41f038603d33`
- 文档提交会在本次代码提交之后继续推进；下一位以实际 branch HEAD 为准。
- 本轮没有合并 `main`。
- 本轮没有运行真实浏览器、build、lint、test。



## 22. P2.5 第一小步已完成：清理 Live inline 播放的遗留 decoderEngine

### 22.1 确认
`src/features/live/LiveFeature.jsx` 的 inline 播放仍保留 `decoderEngine` state、global cache 字段以及传给 `SangtianPlayerWindow` 的旧 props。

但 P1.6 已经移除了播放器 UI 中的假 Decoder Engine 控制，`SangtianPlayerWindow` 也不再消费这些 props。因此这些状态已经没有实际功能，只会制造“Live 仍支持手动解码内核切换”的错误暗示。

### 22.2 已修改
删除：
- `globalLiveCache.decoderEngine`
- `decoderEngine` React state
- decoderEngine global cache sync effect
- `decoderEngine / onChangeDecoderEngine` 传参

没有改变 Live 的频道、线路、EPG、inline 播放或沉浸播放逻辑。

### 22.3 静态验证
当前 `LiveFeature.jsx` 已不再声明或传递 decoderEngine。

尚未验证：
- 浏览器真实 Live inline 播放
- Live inline → immersive 状态连续性
- build / lint / test

### 22.4 下一步
继续 P2.5，但不要一次性重写 LiveFeature：
1. 优先比较 LiveFeature 当前 inline controller 生命周期与 `usePlaybackController` 的能力差异。
2. 如果能无行为损失迁移，则让 inline Live 也使用共享 hook；否则先抽取最小共享 Live controller 生命周期，不复制一套 playbackCore。
3. 然后再考虑将 `PlaybackPage.jsx` 正式更名为 `LivePlaybackPage.jsx`，并把“inline preview / immersive playback”的职责写清楚。

### 22.5 接力状态
- 当前代码提交：`16e40d84a82d0e48e8f4dd0a0de4d234c13e5293`
- 文档将在该代码提交后继续更新；实际 branch HEAD 为准。


## 23. P2.5 第二小步已完成：Live inline 播放接入共享 usePlaybackController

### 23.1 修改前的问题
`src/features/live/LiveFeature.jsx` 原先自己维护：
- `playbackService.createController()`
- controller state callback
- candidate / resolvedInput / status / error state
- attachPlayer → start → resolveAndLoad
- cleanup → controller.leave
- Live 线路失败后的手工 fallback

这与已经存在的 `src/playback/usePlaybackController.js` 重复维护播放生命周期。

### 23.2 已完成
Live inline preview 现在改用 `usePlaybackController({ request, videoRef, isLive: true })`。

保留 LiveFeature 自己应该负责的内容：
- 频道选择
- 延迟线路读取
- activeStreamIndex
- EPG
- 频道缓存
- inline / immersive 状态

移除：
- inline 自己创建 PlaybackController
- inline 自己 attach/start/resolve/leave
- 已废弃 decoderEngine state

线路切换仍通过共享 hook 返回的 `switchCandidate`。

### 23.3 静态检查
已确认：
- LiveFeature 不再直接调用 `playbackService.createController`。
- LiveFeature 不再直接调用 `attachPlayer()`。
- LiveFeature 使用共享 `usePlaybackController`。
- LiveFeature 不再存在 decoderEngine 引用。
- activeStreamIndex 会根据共享 hook 的当前 candidate 同步。

尚未验证：
- Live 浏览器真实播放
- inline → immersive 切换
- 线路失败自动 fallback 的真实行为
- build / lint / test

### 23.4 潜在回归点
- `usePlaybackController` 是共享生命周期层；不要重新在 LiveFeature 增加第二套 controller 创建。
- Live 的 UI 仍使用 `SangtianPlayerWindow`，因此“inline 是轻量 preview”目前主要是职责层面的目标，视觉/控制精简仍未完成。
- `PlaybackPage.jsx` 仍是 immersive Live 播放页，下一步应继续收敛命名与控制职责，而不是复制新的播放器组件。

### 23.5 下一步
优先处理 Live 播放页面命名和入口职责：
1. 确认 `PlaybackPage.jsx` 的调用方只服务 Live。
2. 将其重命名为 `LivePlaybackPage.jsx`（保留必要兼容导出，避免一次性破坏调用方）。
3. 再检查 LiveFeature 的 inline PlayerWindow 是否需要减少“停止/复制/方向/比例/全屏”等非 preview 控制。

### 23.6 接力状态
- 当前代码提交：`f4a988132175855d33557b7d33ebcba6a76afb36`
- 文档提交将在本次代码提交后继续推进。


## 24. P2.5 第三小步已完成：正式命名 LivePlaybackPage

### 24.1 修改
- 新增 `src/pages/LivePlaybackPage.jsx`，承载原沉浸式 Live `PlaybackPage` 实现。
- `src/app/App.jsx` 的两个 `live-play` 渲染分支全部改为 `LivePlaybackPage`。
- 删除旧 `src/pages/PlaybackPage.jsx`，不再保留语义模糊的通用 PlaybackPage 文件名。

### 24.2 为什么
当前 VOD 正式播放页已经明确是 `MoviePlaybackPage`，Live 沉浸式播放也应该拥有明确的领域名称。这样后续 AI 看到 `LivePlaybackPage` 就能立即知道：
- 它不是 VOD 播放页；
- 它是 Live immersive 播放页；
- `LiveFeature` 的 inline 播放是另一种 Preview 场景；
- 底层播放生命周期统一由 `usePlaybackController` / `playbackCore` 提供。

### 24.3 回归修正
重命名过程中静态回读发现旧文件中有一处历史文本替换留下的字面量 `\\n`，会导致 JSX 源码非法。已立即修正为真实换行，并再次检查新文件。

### 24.4 静态验证
已确认：
- App 不再 import `PlaybackPage`。
- App 中 `<PlaybackPage>` 使用数为 0。
- App 中 `<LivePlaybackPage>` 使用数为 2，对应正常与 error 两个 `live-play` 分支。
- `LivePlaybackPage.jsx` 导出 `LivePlaybackPage`。
- 新页面没有直接调用 `playbackService.createController`。
- 旧 `PlaybackPage.jsx` 已删除。

尚未验证：
- 浏览器 Live 沉浸播放；
- JSX/build/lint/test；
- 全屏、线路切换、返回导航的真实运行。

### 24.5 下一步
继续 P2.5：
1. 审计 `LiveFeature` inline 的 `SangtianPlayerWindow`，把 inline 明确收敛为 PreviewPlayer 级别的最小控制。
2. 优先判断哪些控件只属于 immersive：停止、复制直链、方向/比例、全屏等；不要先删，先确认它们是否存在必要的 inline 使用场景。
3. 保留基础播放状态、线路切换与“沉浸播放”入口。
4. 完成后再进入 P2.6：History → 直接恢复对应 episode 的播放闭环。

### 24.6 接力状态
- 当前代码最新提交：`d7260ffa0bf90f748de99d544ef374f9bd5a94e8`
- 当前分支：`ai-handoff/playback-phase1`
- 未合并 main。
- 本轮没有运行浏览器、build、lint、test。


## 25. P2.5 第四小步已完成：Live inline 控件收敛

### 25.1 新发现
`LiveFeature` 的 inline `SangtianPlayerWindow` 传入 `isLive=true`，而其 `onToggleImmersive` 当前不会把 inline 状态切入沉浸态。因此非全屏 Live 的“全屏播放”按钮属于无效入口。

### 25.2 已修改
文件：`src/components/theme/SangtianPlayerConsole.jsx`

inline / 非 fullscreen 状态下：
- Live 保留“停止”控制；
- Live 隐藏“复制直链”；
- Live 隐藏“横竖屏”；
- Live 隐藏“画面比例”；
- Live 隐藏无效的“全屏播放”按钮。

VOD 原有这些控件全部保留。

Live 正式沉浸播放继续由 `LivePlaybackPage` 负责；页面下方已有明确“沉浸播放”入口，没有再制造第二个入口。

### 25.3 为什么
职责进一步明确：
- inline Live = 预览 / 选台上下文；
- LivePlaybackPage = 完整沉浸播放；
- VOD = MoviePlaybackPage；
- 底层播放生命周期 = usePlaybackController / playbackCore。

### 25.4 静态验证
已回读确认 inline Live toolbar 中复制、方向、比例、全屏均由 `!isLive` 条件包裹；停止按钮仍保留。

尚未验证：
- 浏览器真实 Live inline；
- inline → immersive 的真实视觉/状态连续性；
- build / lint / test。

### 25.5 下一步
进入 P2.6：History → 播放闭环。
重点：
1. 历史记录是否携带 contentId + episodeId + source/position；
2. 点击历史是否直接恢复对应 episode；
3. 恢复后的 returnRoute 是否合理；
4. 是否统一复用 `watchProgressService.getContentResume()`，避免 History 再实现一套 resume 规则。

### 25.6 接力状态
- 当前代码提交：`1efb57a806efe74cb54c5fd381b018c517cb80b2`
- 当前分支：`ai-handoff/playback-phase1`
- 未合并 main。
- 本轮没有运行浏览器、build、lint、test。


## 26. P2.6 已完成：History → 直接恢复对应影视集数

### 26.1 审计发现
`MainPage.jsx` 的播放历史卡片以前只执行：
`onMovie(movie)`

因此用户点击历史记录后：
- 只进入影视详情；
- 没有使用历史记录里的 `episodeId`；
- 没有直接恢复对应集数；
- 历史记录已经保存的 `sourceId / positionSeconds / durationSeconds` 没有形成直接播放入口。

### 26.2 已修改
文件：`src/pages/MainPage.jsx`
- 历史卡片根据 `historyItem.episodeId` 找到对应 episode index。
- 点击历史卡片改为调用：
  `onPlay(movie, episodeIndex, historyItem.sourceId, 'history')`
- 因此直接进入现有 `playMovie()` → `MoviePlaybackPage` 流程。
- 没有新建 History 专用播放器，也没有复制 resume 逻辑。

文件：`src/app/App.jsx`
- `getMovieReturnRoute()` 增加 `history`。
- `returnFromMoviePlayback()` 增加回 `tab=history`。
- ErrorBoundary 的播放页恢复逻辑同样支持 `returnRoute=history`。
- 所有 MainPage 渲染分支均传入 `onPlay={playMovie}`。

### 26.3 为什么这样设计
历史记录负责告诉入口“用户上次在哪一集、哪个源”，播放系统仍统一负责：
- source/candidate fallback；
- autoplayResume；
- progress persistence；
- player lifecycle；
- playback error recovery。

这样不会出现“详情页续播一套、历史页续播一套”的第二套播放状态机。

### 26.4 静态验证
已确认：
- History card 使用 `episodeId` 计算 episodeIndex。
- History card 传递历史 `sourceId`。
- App 能识别 `returnRoute=history`。
- 正常返回和 ErrorBoundary 恢复均能回 History。
- MainPage 的 3 个渲染调用点都传入 `onPlay`。

尚未验证：
- 浏览器真实点击历史卡片；
- 对应 episode 是否实际从正确 position 恢复；
- 已失效 sourceId 时的 fallback；
- build / lint / test。

### 26.5 下一步
继续 P2.6：
1. 审计 Favorites → 播放闭环，确认收藏影视是否能保持正确 content identity；
2. 审计 Live History 是否应该直接恢复对应频道/线路，而不是只回频道详情；
3. 然后进入 P2.7：整理 playback context，逐步减少 `selected` / `metadata.returnRoute` 这种散落约定。


## 27. P2.6 补充完成：Live History → 直接恢复频道线路

### 27.1 审计发现
Live 历史记录已经保存：
- channelId
- streamId
- sourceId
- lastPlayedAt

但 History 页原来点击 Live 历史只进入 `live-channel` 详情，没有利用 `streamId` 直接播放。

### 27.2 已修改
文件：`src/pages/MainPage.jsx`
- Live History 现在保留 history item 与 channel 的对应关系。
- 点击历史记录调用 `onLive(channel, item.streamId, 'live-history')`。
- 因此进入现有 `playLive()`，由其负责 preferred source / candidate 排序和 LivePlaybackPage 生命周期。

文件：`src/app/App.jsx`
- `handleLiveBack()` 支持 `returnRoute=history`，Live 播放返回 History。
- Live 播放 ErrorBoundary 恢复同样支持 `returnRoute=history`。

### 27.3 责任边界
History 不负责播放器状态，也不复制 Live fallback。
它只负责把“上次播放的频道 + 线路”交给统一 `playLive()`。

### 27.4 静态验证
已确认：
- Live History 使用保存的 `streamId`。
- 返回路径识别 `history`。
- 正常返回与播放异常恢复均可回 History。
- 未改变 LivePlaybackPage / playbackCore。

尚未验证：
- 已删除/失效 streamId 的 fallback；
- 浏览器真实 Live History 点击；
- build / lint / test。

### 27.5 下一步
P2.6 的下一项优先审计：Favorites → 播放闭环。
重点确认收藏影视使用稳定 `contentId`，收藏 Live 使用稳定 `channelId`，且点击收藏内容不会绕过统一播放入口。


## 28. P2.6 / P2.7 已推进：收藏闭环审计 + 显式 PlaybackContext

### 28.1 Favorites → playback 闭环审计结果
已检查 `src/pages/MainPage.jsx`：

- 影视收藏以 `targetType=content + targetId=contentId` 保存。
- 收藏页通过 `movie.contentId` 找回内容，点击后进入统一 `onMovie` → 详情页；详情页的播放按钮统一进入 `onPlay` → `App.playMovie()`。
- Live 收藏以 `targetType=channel + targetId=channelId` 保存。
- 收藏页通过 `channel.channelId` 找回频道，点击后进入统一 `onLiveChannel` → Live 频道详情；详情页播放统一进入 `onPlay` → `App.playLive()`。
- 收藏入口没有创建第二套播放器，也没有直接操作 playback controller。

结论：Favorites 当前没有绕过统一播放入口；稳定 identity 也正确使用 contentId / channelId。

### 28.2 顺手发现并修复的 Live History 返回回归
P2.6 上一轮的 History 调用传入了 `'live-history'`，但 `App.handleLiveBack()` 只识别 `history`。
因此 Live History 虽然能直接播放，却可能返回 Live 列表而不是 History。

已修正：
- `src/pages/MainPage.jsx`：Live History 统一传 `returnRoute='history'`。
- 这样与 VOD History、App 返回逻辑和 ErrorBoundary 恢复逻辑使用同一个 return context。

这是本轮实际发现的回归点，不再把“已完成”只停留在静态设计层面。

### 28.3 P2.7 第一小步：PlaybackContext 显式化
新增：
- `src/playback/playbackContext.js`

提供：
- `createPlaybackContext()`
- `getPlaybackContext()`

统一上下文字段：
- kind
- contentId
- episodeId
- episodeIndex
- channelId
- streamId
- sourceId
- candidateId
- returnRoute
- returnTab
- startPositionSeconds

修改：
- `src/models/playback.js`
  - playback request 增加顶层 `context`，不再要求所有页面从 `metadata` 猜返回语义。
- `src/services/playbackService.js`
  - VOD / Live request 都支持透传 context。
- `src/app/App.jsx`
  - playMovie / playLive 创建显式 context。
  - 返回导航、ErrorBoundary 恢复优先从 `getPlaybackContext(request)` 读取 returnRoute。
- `src/features/movie/MoviePlaybackPage.jsx`
  - episode 上一集/下一集/选集统一从显式 PlaybackContext 读取 returnRoute。
- 保留旧 `metadata.returnRoute` 作为兼容 fallback，因此没有一次性破坏历史请求结构。

### 28.4 为什么现在做这个
此前播放上下文散落在：
- selected request
- request.metadata.returnRoute
- metadata.sourceId
- metadata.episodeIndex
- 调用方额外传 route 字符串

这会让下一位 AI 很容易继续增加新的 route / metadata 约定。

现在开始形成单一规则：
- request.context = 播放导航/恢复上下文
- request.metadata = 展示与解析附加信息
- request.candidates = 可播放资源集合

### 28.5 当前验证
已做静态回读：
- Favorites content/channel identity 与入口链路正确。
- Live History 使用统一 `history` returnRoute。
- playback request 有顶层 context。
- App / MoviePlaybackPage 已优先读取 context。
- 旧 metadata.returnRoute 仍有兼容 fallback。

尚未验证：
- 浏览器真实播放；
- History/Favorites 点击后的真实返回；
- build / lint / test；
- Native/HLS runtime。

### 28.6 当前最新代码状态
- 分支：`ai-handoff/playback-phase1`
- 最近代码提交：`f622fd7c4cb643b98037aa423e2059c7f3cc3aad`
- 本文档将在本次代码修改后再提交一次，以保持接力状态完整。
- 未合并 main。

### 28.7 下一位 AI 第一任务
不要重新审计 Favorites / History identity，也不要重新创建 PlaybackContext。

直接继续 P2.7：
1. 把剩余页面/恢复逻辑里直接读取 `metadata.returnRoute` 的地方迁移到 `getPlaybackContext()`。
2. 检查 `returnTab` 是否可以替代部分硬编码 `tab='movies'/'live'`。
3. 统一 VOD / Live 的播放返回 helper，减少 App 内重复的 route 分支。
4. 再进入 P3 前，优先做一次静态全局回归检查，并在环境允许时运行 build/lint/test。

### 28.8 潜在回归点
- 不要把 `request.context` 当成实时 candidate 状态；candidate 切换仍由 controller/request candidates 管理。
- 不要删除 metadata 兼容 fallback，除非确认所有旧 request 创建路径已经迁移。
- `returnRoute='history'` 是当前 History 播放闭环的统一语义；不要重新引入 `live-history` 之类的平行 route 名称。

## 29. P2.7 第二小步已完成：统一 VOD / Live 播放返回目标

### 29.1 修改
继续沿用显式 PlaybackContext，没有再创建新的播放器状态层。

新增 src/playback/playbackContext.js：
- resolvePlaybackReturnRoute()：统一根据显式 returnRoute、当前 route/tab 推导播放入口语义。
- resolvePlaybackReturnTarget()：把播放请求直接解析成统一导航目标 { tab, route, selected }。
- history 始终返回 History；detail/search/movies 保留原有语义；returnTab 只作为目标 tab 的补充，不覆盖 history 这种明确业务语义。

修改 src/app/App.jsx：
- getMovieReturnRoute() 改为复用 resolvePlaybackReturnRoute()。
- VOD 正常返回改为复用 resolvePlaybackReturnTarget()。
- VOD ErrorBoundary 恢复改为复用同一个 return target helper，删除重复的 route 分支。
- 普通 VOD 页面 onBack 不再自己拼 returnRoute + selected，直接复用 returnFromMoviePlayback()。
- Live 返回保留 live-channel 的特殊业务恢复；其余 History / Live 默认返回统一复用 resolvePlaybackReturnTarget()。

### 29.2 结果
播放返回逻辑现在从 App 正常返回一套、App ErrorBoundary 一套、MovieFeature onBack 再一套，收敛为同一个 PlaybackContext → ReturnTarget 解析规则。

同时明确：
- request.context：播放导航/恢复语义；
- request.metadata：展示/解析附加信息；
- request.candidates：实时可播放资源；
- returnTab：默认目标 tab，不取代 returnRoute 的业务语义。

### 29.3 静态验证
已完成源码级回读：
- App 使用 resolvePlaybackReturnRoute / resolvePlaybackReturnTarget。
- 不再保留 VOD ErrorBoundary 的重复 returnRoute 分支。
- VOD onBack 不再直接拼装 PlaybackContext 字段。
- Live live-channel 特殊恢复仍存在，没有错误地把频道详情当普通 tab 返回。
- 未重新引入 live-history。
- 尚未运行浏览器、build、lint、test。

### 29.4 下一步
按优先级先做一次 P2.7 全局静态回归：
1. 检查所有播放 request 创建点是否都已携带/兼容 PlaybackContext。
2. 检查全仓是否仍有直接 metadata.returnRoute 读取。
3. 检查 returnRoute / returnTab 是否存在语义冲突。
4. 检查 PlaybackPage、旧 decoderEngine、重复播放 controller 等遗留命名/路径。
5. 若静态结果稳定，再进入 P3 UI/响应式收敛；同时在环境允许时优先跑 build/lint/test。
## 30. P2.7 全局静态回归完成：播放导航链进一步收敛

### 30.1 本轮修正
发现 AppRoot.recoverFromPageError() 的 live-play 仍保留旧的 history / live 重复分支。
已改为直接复用 resolvePlaybackReturnTarget(selected, { fallbackTab: 'live' })。
因此 VOD / Live 的正常返回与 ErrorBoundary 返回现在都经过统一 ReturnTarget 解析。

### 30.2 全局静态审计结论
已回读核心播放链：App、playbackContext、playback model/service、usePlaybackController、MoviePlaybackPage、MovieFeature、LiveFeature、LivePlaybackPage、SangtianPlayerConsole、MainPage、watchProgressService。
确认：
- 播放 request 的正式创建入口仍集中在 playbackService。
- LiveFeature 的正式播放生命周期仍通过 usePlaybackController，没有重新引入页面级 createController。
- MainPage 的 VOD / Live History 都统一经过 onPlay / onLive，Live History 使用 returnRoute='history'。
- MovieFeature 返回 detail 时可从 playback request 的 contentId 重新解析真实 movie，不依赖把 request 当完整 movie。
- SangtianPlayerConsole 不再出现 decoderEngine。
- 旧 PlaybackPage.jsx 已删除，正式 Live 沉浸页为 LivePlaybackPage.jsx。
- 仍存在 playbackContext.js 内对 metadata.returnRoute 的兼容读取，这是有意保留的迁移兜底，不属于业务页面直接读取。
- returnRoute 与 returnTab 当前语义没有发现冲突：明确 route 优先，tab 只作 fallback。

### 30.3 当前验证边界
本轮属于源码静态审计与修正。
当前环境没有可用的仓库本地执行结果，因此：
- 浏览器 E2E：未运行
- npm build：未运行
- lint：未运行
- unit test：未运行
- CI：当前提交没有可引用的 workflow run
不能把静态通过写成运行时通过。

### 30.4 下一优先级：P3 播放 UI / 响应式收敛
P2.7 导航与播放上下文已经基本收口，下一阶段不再继续无收益地拆 App。进入 P3 时按以下顺序：
1. 审计 SangtianPlayerConsole 的 VOD / Live 共用 UI，继续减少重复控制与信息密度。
2. 审计普通页与沉浸页的控制层级，明确主控制 / 次控制 / More。
3. 审计移动竖屏、横屏、桌面宽屏三个布局状态，避免播放区与侧栏互相挤压。
4. 将播放器 UI 与播放生命周期彻底解耦：UI 只发 intent，不自行管理 source/controller。
5. 最后再做 CSS / 命名 / 微交互清理。
## 31. P3.1 播放 UI 层级第一轮收敛

### 31.1 发现的问题
播放器本体已经承担普通播放操作、全屏控制、倍速、画面比例、选集 / 线路、音轨 / 字幕 / 清晰度、直播选台。
但 VOD 页面外层又额外挂了 SangtianFloatingBar，造成倍速 / 播放时间信息与播放器控制重复，而且该组件仍保留了已经失效的 currentCandidateLabel / onOpenSourceModal 调用方参数。

### 31.2 已实施
- VOD MoviePlaybackPage 移除 SangtianFloatingBar。
- 播放控制统一回到 SangtianPlayerWindow。
- SangtianConsoleCard 移除重复的“复制播放直链”区域；播放直链复制只保留播放器顶部入口。
- 修正 SangtianPlayerConsole.jsx 缺失的 Heart / Radio icon import，避免 Live ConsoleCard 实际渲染时引用未定义组件。
- 保留 ConsoleCard 的真正业务内容：VOD 资料 / 相关推荐、Live 频道选择。

### 31.3 当前 UI 层级
VOD：页面上下文 → PlayerWindow 播放本体与主播放控制 → Fullscreen 播放控制 + More + 选集 → ConsoleCard 资料与相关推荐。
Live：PlayerWindow 直播本体 / 直播状态 / 选台 / 设置 → ConsoleCard 频道浏览 → 沉浸页承担真正的全屏入口。
这比之前的播放器 + FloatingBar + ConsoleCard 各自都提供播放能力，更接近单一主控制面。

### 31.4 验证边界
本轮仍为源码静态修改，未运行浏览器、build、lint、unit test。

### 31.5 下一优先级：P3.2 响应式布局
下一轮优先审计播放器 CSS：普通桌面宽屏、平板 / 中等宽度、手机竖屏、手机横屏 / 全屏。
重点确认侧栏、底部控制条、顶部触发器不会挤压或遮挡视频本体；然后再处理残余命名和视觉微调。
## 32. P3.2 响应式播放布局第一轮完成

### 32.1 CSS 审计结论
原播放器已经有桌面 / 全屏基础样式，但窄屏主要只有少量字号缩放；全屏顶部操作、底部操作、Live 中央信息条和左右侧栏在手机竖屏下存在潜在挤压风险。

### 32.2 已实施
- 720px 以下：缩小播放器外边距、允许普通播放器顶部操作换行、降低视频最小高度，避免横向溢出。
- 560px 以下：重新约束全屏顶部左右操作区、隐藏不必要的时钟 / source 标签、收紧标题宽度。
- 560px 以下：底部操作改为两列按钮网格，极窄屏进一步调整为三列，保证触控目标仍可用。
- 560px 以下：Live 中央信息条缩窄并限制频道标题宽度。
- 560px 以下：左右全屏侧栏改为不超过 92vw，避免小屏完全遮死操作区域。
- 380px 以下：普通窗口按钮进入 icon-first 模式，进一步减少顶部拥挤。
- 横屏且高度较低时：进一步压缩全屏控制区垂直占用。

### 32.3 重要边界
本轮没有重写播放器全屏 / orientation JavaScript，仅通过响应式 CSS 降低布局风险。现有 is-landscape 的 JS + CSS 旋转机制仍应在真实 Android / iOS 浏览器中验证，暂不在没有运行时证据的情况下继续改动。

### 32.4 下一优先级：P3.3 播放器交互与状态解耦审计
下一轮重点不是继续加按钮，而是检查 SangtianPlayerWindow 是否仍直接操作 videoRef 的播放 / seek / playbackRate，以及这些 intent 是否应该由 PlaybackController 统一承接。
原则：UI 发 intent，controller 决定播放生命周期；不要把底层 controller 再复制回页面 UI。

## 33. P3.3 播放器 UI / Controller intent 解耦完成

### 33.1 已实施
- playbackCore / playbackService / usePlaybackController 统一暴露 play、pause、seek、setPlaybackRate intent。
- html5PlayerAdapter 与 nativePlayerAdapter 增加 setPlaybackRate 能力。
- SangtianPlayerWindow 的播放/暂停、拖动进度、±10 秒、倍速切换不再直接写 video.play()/pause()/currentTime/playbackRate，而是调用 controller intent props。
- MoviePlaybackPage 与 LivePlaybackPage 的倍速和播放控制统一走 controller。
- LivePlaybackPage 停止时删除页面级 pause/removeAttribute/load，统一由 controller.stop() 负责生命周期。

### 33.2 有意保留
SangtianPlayerWindow 仍读取 video.currentTime、duration、buffered、paused、readyState 做展示型 metrics / UI 状态同步；这是只读观测，不属于播放生命周期控制。

### 33.3 静态验证
- SangtianPlayerConsole：无直接 video.play()/pause()/currentTime 写入/playbackRate 写入。
- MoviePlaybackPage：无直接 videoRef.current.playbackRate/currentTime/play/pause。
- LivePlaybackPage：播放控制与停止生命周期已收口到 controller。
- 未运行浏览器、npm build、lint、unit test；native 宿主 setPlaybackRate 尚未运行时验证。

### 33.4 下一优先级：P3.4
继续清理播放器 UI 的重复状态来源：重点审计 isPlaying / currentTime / duration / status 是否同时由 DOM 事件、controller 状态、页面 state 三套维护。目标是减少重复状态，而不是继续增加控制按钮。


## P3.4 已完成：播放状态源去重

### 本轮目标
围绕 `isPlaying / currentTime / duration / status` 检查是否存在 controller、DOM event、页面 local state、播放器 UI 四处同时维护的问题。确认后收敛到 controller hook 为播放状态的主来源，UI 只消费状态。

### 已修改
- `src/playback/usePlaybackController.js`
  - 增加 controller-owned `currentTime / duration` React state。
  - VOD playback progress 事件更新该状态，同时继续使用 `progressRef` 做持久化节流。
  - `isPlaying` 直接由 controller 的 `status === 'playing'` 派生。
  - request identity 改变时重置 metrics，避免上一集时间残留到下一集。
- `src/components/theme/SangtianPlayerConsole.jsx`
  - 删除 `currentTime / duration / isPlaying` 的 page-local state。
  - 删除 UI 对 `timeupdate / playing / pause` 事件负责维护播放状态的做法。
  - seek / ±10s 使用 controller 提供的 `currentTime`，不再先写 UI local state。
  - 保留 videoRef 的只读 buffered 观测，用于缓冲区可视化/指标；这不再作为播放状态权威来源。
- `src/features/movie/MoviePlaybackPage.jsx`
  - 直接消费 `usePlaybackController` 返回的 `currentTime / duration / isPlaying`。
  - 将这些值传给 PlayerWindow。
- `src/pages/LivePlaybackPage.jsx`
  - 删除 candidate/status/resolvedInput/error 的镜像 local state。
  - 直接使用 `usePlaybackController` 的 candidate/status/resolvedInput/error。
  - 删除对应同步 useEffect，避免 controller → page state → UI 的重复链路。

### 状态责任边界
- `status`：PlaybackController / PlaybackCore state machine 是权威来源。
- `isPlaying`：由 `status === 'playing'` 派生，不再由 DOM event 自己维护一份。
- `currentTime / duration`：VOD 由 PlaybackCore progress event → usePlaybackController state 提供给 UI。
- `bufferedSeconds / bufferRate`：仍属于 PlayerWindow 的只读媒体指标，不作为播放状态源。
- videoRef：页面/UI 只读观测，不直接驱动播放状态。

### 静态验证
已回读确认：
- PlayerWindow 不再声明 `setCurrentTime / setDuration / setIsPlaying`。
- PlayerWindow 不再使用 `onTimeMetricsChange`。
- VOD 页面消费 controller metrics。
- Live 页面不再维护 controller state 的镜像 local state。
- 本轮未运行浏览器、build、lint、unit test，因此这些仍不能宣称通过。

### 未完成
- 需要实际运行验证 VOD progress event 的频率与 duration 在 HLS/DASH/native fallback 场景是否稳定。
- 需要继续审计 PlayerWindow 内是否还有“控制意图”和“只读媒体观测”之外的 page-local playback state。
- P3.5 优先检查 fullscreen/orientation 状态与移动端实际行为，尤其现有 `.is-landscape` CSS/rotation 逻辑。
- 之后再做更大范围视觉 polish。

### 当前接力要求
下一位 AI 不要重新做 P3.4 状态源调查。优先检查本轮静态改动是否有调用方遗漏，然后继续 P3.5 移动端全屏/横竖屏行为审计。


## P3.5 已完成：移动端全屏 / 横竖屏状态语义收敛

### 本轮目标
继续 P3.4 后的最高优先级，审计播放器在手机竖屏、横屏、Fullscreen API、CSS fallback 之间是否存在重复状态和强制旋转。重点检查 `is-landscape`、`requestFullscreen`、`fullscreenchange`、Orientation API、viewport 高度与 safe-area。

### 已发现的问题
- `SangtianPlayerConsole` 原来同时维护 `isSystemFullscreen` 与 `isWebFullscreen`，但进入全屏时会同时把两个 CSS class 加到播放器上，语义不清。
- 原 `.is-landscape` CSS 使用 `rotate(90deg)` + `100vh/100vw` 强制旋转播放器。这会与真实设备 orientation、浏览器 Fullscreen API 和 Android/iOS viewport 行为产生竞争，尤其容易出现点击坐标/安全区/视频尺寸错位。
- Fullscreen 时使用固定 `100vh`，移动浏览器地址栏收缩/展开时可能留下可见空白或控制栏被遮挡。
- Orientation button 原来点击后立即修改 React state，即使 `screen.orientation.lock()` 被浏览器拒绝，也会产生“看起来已经横屏”的假状态。

### 已修改
文件：`src/components/theme/SangtianPlayerConsole.jsx`
- `isSystemFullscreen` 只代表真实 `document.fullscreenElement`。
- `isWebFullscreen` 只作为 Fullscreen API 不可用/被拒绝时的 CSS fallback；不再进入 Fullscreen API 后也强行设置该状态。
- 新增实际 orientation 同步：优先读取 `screen.orientation.type`，并以 `matchMedia('(orientation: landscape)')` / `orientationchange` 作为兼容来源。
- Orientation button 不再先写假状态；只有真实 Orientation API 自己改变 viewport 后，UI 才跟随实际方向。
- 全屏状态统一输出单一 `is-fullscreen` CSS class，不再同时输出 `is-system-fullscreen is-web-fullscreen`。
- Fullscreen 不再自动调用 `screen.orientation.lock()`；全屏与旋转两个动作解耦，方向由用户的方向控制或设备真实方向决定。

文件：`src/styles/app.css`
- 删除 `.sangtian-window.is-landscape` 的固定 90° CSS rotation。
- 删除依赖 `100vh/100vw` 的横屏旋转布局。
- 统一 Fullscreen 为 `.is-fullscreen`。
- Fullscreen 使用 `100dvw/100dvh`（同时保留 `100vw/100vh` fallback）适配移动浏览器动态 viewport。
- aspect 预设改为使用真实 fullscreen viewport，不再减去旧的 38px 旋转窗口高度。
- 保留 safe-area inset 控制条布局。

文件：`src/pages/LivePlaybackPage.jsx`
- 既有 `ResizeObserver + resize + orientationchange` 的 Native video surface bounds 同步继续保留；它现在可以配合真实 viewport orientation，而不是依赖播放器自身 CSS 90° rotation。

### 当前责任边界
- Fullscreen 状态：浏览器 Fullscreen API / PlayerWindow fallback。
- Orientation 状态：设备/浏览器真实 viewport orientation。
- 播放控制：PlaybackController intent。
- CSS：只负责适配真实 viewport，不再伪造设备旋转。
- Native surface：LivePlaybackPage 根据实际播放器容器尺寸重新同步 bounds。

### 静态回归检查
已回读确认：
- `SangtianPlayerConsole.jsx` 不再生成 `is-system-fullscreen` / `is-web-fullscreen` / `is-landscape` class。
- `app.css` 不再存在旧 90° `rotate(90deg)` 播放器旋转规则。
- `LivePlaybackPage.jsx` 的 orientationchange / ResizeObserver bounds 同步仍存在。
- Fullscreen API 入口仍只有 PlayerWindow 一处正式 UI 行为。
- 本轮未运行浏览器、Android/iOS 真机、npm build、lint、unit test。

### 未完成 / 风险
- 必须在真实 Android Chrome、iOS Safari、普通桌面浏览器分别验证：
  1. 竖屏进入 Fullscreen；
  2. Fullscreen 后设备旋转到横屏；
  3. 点击“横屏/竖屏”按钮时 Orientation API 成功与被拒绝两种情况；
  4. 地址栏展开/收起时控制栏与视频是否仍覆盖完整 viewport；
  5. iOS 不支持 Orientation API 时是否保持真实设备方向而不出现假旋转；
  6. Native Live video surface bounds 在旋转后是否仍准确。
- 不要在没有真实设备证据的情况下重新加入 CSS `rotate(90deg)`。

### 下一优先级
P3.6：继续做播放器 UI / CSS 最后一轮收敛，但重点从“继续加功能”转为：
1. 清理残余 fullscreen CSS 旧命名/重复规则；
2. 检查 PlayerWindow 内是否还有 page-local playback state；
3. 检查普通窗口 / Fullscreen / Live inline 三种模式的唯一控制入口；
4. 最后再做视觉 polish 与命名清理。


## P3.6 已完成：Fullscreen CSS / 播放器 UI 残余清理

### 本轮修改
- 删除已经没有调用方的 `.fullscreen-quick-exit` CSS。
- 删除重复的 `.is-fullscreen` 后置覆盖规则，保留唯一 fullscreen layout 定义，避免 z-index / body height 被后面的旧规则意外覆盖。
- `SangtianPlayerConsole.syncMediaMetrics()` 删除未使用的 `duration` 临时变量；duration 的权威 UI 数据继续来自 controller。
- 全局回读确认 PlayerWindow 当前仍只把 videoRef 用作只读媒体观测（buffered / currentTime），没有恢复直接 play/pause/seek/playbackRate 写入。

### 当前 UI 入口
- 普通播放窗口：停止、复制（VOD）、方向、比例、全屏。
- Fullscreen：返回、播放/暂停、进度、±10 秒（VOD）、倍速、More / 选集 / 线路 / Live 频道等上下文控制。
- Source / candidate 选择不再从多个播放控制栏重复出现。
- Fullscreen 与 orientation 已经是两个独立状态：Fullscreen API 控制全屏，真实 viewport orientation 控制横竖屏。

### 验证边界
已完成静态回读：
- CSS 不再包含旧 `is-landscape` 90° rotation。
- CSS 不再包含 `is-system-fullscreen` / `is-web-fullscreen`。
- PlayerWindow 不再输出这些旧 class。
- 未运行浏览器、真机、build、lint、unit test。

### 下一优先级
P3.7：做一次最终播放链静态回归，然后如果环境允许优先运行 build/lint/test；之后才考虑视觉 polish。重点检查：
1. `usePlaybackController` 的 request lifecycle 是否稳定；
2. VOD / Live controller intent 是否没有遗漏调用方；
3. Fullscreen fallback 与 document fullscreen 状态是否没有双状态残留；
4. PlayerWindow 的 local state 是否全部属于 UI 状态/只读指标，而不是第二套 playback state machine。


## P3.7 已完成：最终播放链静态回归与调用方修正

### 本轮回归重点
按 P3.6 handoff 对 controller lifecycle、VOD / Live intent、Fullscreen 状态、PlayerWindow 状态源做最终静态回归。

### 本轮实际发现并修复
1. `src/services/playbackService.js`
   - `createController()` 返回对象中 `seek()` / `setPlaybackRate()` 重复声明了一次。
   - 删除重复声明，避免维护时误以为存在两套 controller API。
2. `src/pages/LivePlaybackPage.jsx`
   - 回归时发现调用 `SangtianPlayerWindow` 使用了错误的 prop 名：`controllerStatus / activeCandidate / resolvedInput`。
   - PlayerWindow 的正式接口实际是 `status / candidate / resolvedInput`。
   - 已修正为 controller 输出直接映射到 PlayerWindow 正式接口。
   - 删除已经不属于 PlayerWindow 接口的 `onOpenSourceModal` 传参。
   - 这是本轮最重要的静态回归修复，否则 Live 播放页可能出现状态/候选为空的 UI 行为。
3. `SangtianPlayerConsole.jsx`
   - 继续确认 `videoRef` 只用于 buffered / readyState / 当前媒体只读观测以及 PIP 等浏览器能力，不重新承担播放生命周期。
   - `isLandscape` 目前只用于 Fullscreen 控制栏的布局 class（portrait / landscape），不再用于播放器本体旋转。

### 最终责任边界
- PlaybackService：创建唯一 controller façade。
- PlaybackCore / state machine：播放生命周期与状态迁移。
- usePlaybackController：React 页面消费层、candidate/status/error/progress 聚合。
- PlayerWindow：UI 状态 + 用户 intent + 只读媒体指标。
- VOD / Live page：组装 request、上下文导航、业务选择，不复制 controller lifecycle。
- Fullscreen：Fullscreen API + CSS fallback。
- Orientation：真实 viewport / Orientation API；不通过 CSS rotate 伪造。

### 静态回归结果
已回读：
- `playbackService.createController()` 的 controller 方法无重复 `seek/setPlaybackRate`。
- Live PlayerWindow 的 `status/candidate/resolvedInput` 已正确连接 controller。
- VOD PlayerWindow 仍直接消费 usePlaybackController 的 status/candidate/resolvedInput/currentTime/duration/isPlaying。
- PlayerWindow 不再声明独立 currentTime/duration/isPlaying playback state。
- 未发现旧 `is-system-fullscreen` / `is-web-fullscreen` / `is-landscape` 播放器本体 class。
- 未发现直接 `video.play()` / `video.pause()` / `currentTime =` / `playbackRate =` 生命周期写入。
- Live Native surface 的 ResizeObserver、resize、orientationchange bounds 同步仍保留。

### 运行验证边界
`package.json` 确认项目存在：
- `npm run build`
- `npm test`
- `npm run test:react`

但当前本轮没有仓库本地 Node/npm 执行环境结果，因此没有把这些命令写成“已通过”。浏览器 / 真机 E2E 也仍未运行。

### 下一优先级
P3.8：如果能取得本地执行环境，优先实际运行 build + test:react + test；若无法运行，则继续做源码级最终回归，重点检查：
1. `usePlaybackController` requestKey / controller 重建时是否存在旧 controller 事件回写新页面 state 的竞态；
2. candidate/status 在切集、切源、retry、fallback 后是否始终同步；
3. VOD progress persistence 与自动下一集是否存在竞态；
4. Live stop / leave / page back 是否存在重复 teardown；
5. 最后再做视觉 polish，不再新增播放架构层。


## P3.8 已完成：request lifecycle 竞态审计与旧 controller 隔离

### 本轮实际发现
静态回读 `usePlaybackController` 时发现 request 切换存在两个真实竞态风险：

1. **旧 controller 异步事件可能回写新 request**
   - 原 controller callback 通过共享 ref 读取当前 request。
   - 旧 episode/source 的 parser/load 如果在新 request 建立后才完成，可能把旧 status / candidate / resolvedInput / error / progress 写到新页面。
2. **request 切换时 progressRef 过早 reset**
   - 原先在 render 阶段检测 requestKey 变化就清空 progressRef。
   - React 随后执行旧 lifecycle cleanup 时，上一集最后进度已经丢失，导致离开/切集时最终进度可能无法持久化。

### 已实施
文件：`src/playback/usePlaybackController.js`

- 每个 controller callback 绑定创建时的 `requestKey`。
- 增加 lifecycle identity guard；旧 controller 的 event / state / candidate / resolvedInput / parser error / player error / exhausted 不再更新新 request 的 React state。
- `resolveAndLoad()` 的异步 catch 同样增加 request identity guard，避免旧加载失败覆盖新 request。
- cleanup 使用创建时的 `requestSnapshot`，保证最终进度归属正确。
- progressRef 的 reset 从 render 阶段移动到 `[requestKey]` effect；React 会先执行上一生命周期 cleanup，再执行新 effect setup，因此上一集可以先保存最终进度，再开始下一集。
- 删除不再需要的共享 `requestRef` 作为旧 request 数据来源。
- controller memo 只以 `requestKey / isLive` 等生命周期依赖重建，不因为 request 对象本身每次 render 都是新引用而重复创建 controller。

### 责任边界进一步明确
- requestKey：播放生命周期 identity。
- requestSnapshot：该 controller 生命周期不可变的 request 快照。
- requestKeyRef：只用于判断异步事件是否仍属于当前生命周期。
- progressRef：当前生命周期的进度缓冲，不跨 episode/source 复用。
- recordProgressRef：允许业务 persistence callback 更新，但不会改变 request 归属。

### 静态回归
已确认：
- 旧 controller event/state/candidate/error 不再越过 request 边界。
- 旧 async resolve error 不再越过 request 边界。
- 上一生命周期 cleanup 仍可读取自己的 requestSnapshot 与最终 progress。
- Live 不走 VOD progress persistence 分支。
- controller API 仍保持单一 façade。

### 运行验证边界
本轮仍未执行 Node/npm、浏览器、Android/iOS 真机，因此不能宣称 build/test 或运行时竞态验证通过。

### 下一优先级
P3.9：继续审计 candidate/status 在手动切源、自动 fallback、retry、stop/leave 后的状态同步，并重点检查 VOD 自动下一集与 progress persistence 是否存在重复导航/重复 teardown。若环境能提供本地 Node/npm，再优先实际执行 `npm run build`、`npm run test:react`、`npm test`。


## P3.9 已完成：候选状态同步、完成进度与 stop/leave 幂等性

### 本轮实际发现
静态回读 VOD / Live 播放链后确认了两个真实生命周期问题：

1. **VOD completed 后切集/离开可能被 cleanup 的未完成进度覆盖**
   - PlaybackCore 会在播放器完成时发出 `completed`。
   - usePlaybackController 收到后先写入 `completed=true`。
   - 但随后自动下一集或手动离开会触发旧 lifecycle cleanup；cleanup 原先无条件再写一次 `completed=false`。
   - 这会让“刚看完这一集”的状态在最终持久化时被覆盖，直接影响继续观看/下一集推断。

2. **Live/VOD stop + leave 可能重复触发 stopped teardown**
   - 页面主动 `controller.stop()` 后，卸载 cleanup 还会调用 `controller.leave()`。
   - PlaybackCore 原来的 `stop()` 每次都会再次调用 player.stop / task.stop / unregister。
   - 虽然多数底层实现最终可恢复，但这会制造重复 stopped 事件与重复资源清理的噪声。

### 已实施
文件：`src/playback/usePlaybackController.js`
- `progressRef` 增加当前 lifecycle 的 `completed` 标记。
- 收到 VOD `completed` 事件时先标记 `completed=true`，再写入一次 completed progress。
- lifecycle cleanup 只有在本集尚未完成时才写 `completed=false` 的最终进度。
- candidate 手动切换不再在 hook 层重复 setCandidate / clear resolvedInput / clear error；正式状态更新统一依赖 PlaybackCore 的 `onCandidateChange` 回调，避免 controller → hook 双写。

文件：`src/playback/playbackCore.js`
- 引入 `PlaybackRequestStatus`。
- `stop()` 对已释放或已经 STOPPED 的 task 直接返回，形成幂等 stop。
- 页面主动 stop 后再由 leave cleanup 执行时，不再重复发 stopped / 重复 unregister。

### 状态责任边界
- 手动换源：PlaybackCore `switchCandidate()` 更新 task candidate，并通过 `onCandidateChange` 驱动 React state。
- 自动 fallback：PlaybackCore `failAndResolve()` 更新 candidate，并通过同一 callback 驱动 React state；不由页面自行猜测 fallback 结果。
- retry：controller 重新 start + resolveAndLoad；候选仍由 task/core 作为权威来源。
- stop/leave：PlaybackCore 负责底层 stop/release，页面只发意图；stop 已具备幂等保护。
- VOD completed：completed progress 一旦写入，本 lifecycle cleanup 不再覆盖成 unfinished。

### 静态验证
已回读确认：
- `createPlaybackTask` 暴露 `status` getter，`PlaybackRequestStatus.STOPPED` 可用于 Core 幂等判断。
- `switchCandidate()` 的候选更新已经有 Core → hook 的单一 callback 通道。
- VOD 自动下一集仍只有 `handleVideoEnded` 负责导航；PlaybackCore completed 事件只负责完成状态与进度持久化，不重复导航。
- 自动下一集倒计时在 request episodeId 改变时清理，不会跨集继续计时。

### 尚未验证
- 未运行浏览器、Android/iOS 真机。
- 未运行 `npm run build`、`npm run test:react`、`npm test`。
- 未做真实网络故障注入验证 A1→A2→B1。
- 未验证 Native bridge stop/release 的真实幂等行为。

### 当前潜在回归点
- `completed` 事件依赖 PlaybackCore/player adapter 的事件顺序；真实播放器仍需验证在 React `onEnded` 导航前是否稳定发出 completed。
- `requestKey` 仍是 controller lifecycle identity；如果未来需要在“不换集但改变关键 playback metadata”时重建 controller，必须同步扩充 requestKey。
- 普通移动端非 fullscreen 的 aspect-ratio CSS 仍需要真实设备验证，暂不继续改动。

### 下一优先级
**P3.10 / 最终验证优先**：停止继续堆播放功能，优先取得可执行环境并实际运行：
1. `npm run build`
2. `npm run test:react`
3. `npm test`
4. 如能启动应用，再验证 Home/Movies/Search/Detail → Play → Back、续播、completed → 下一集、A1→A2→B1 fallback、手动切源、retry、stop/leave、Fullscreen/portrait/landscape。
5. 只有运行验证通过后，再做最后一轮 UI polish / 清理重复信息。


## P3.10 当前进展：执行环境 / CI 可验证性检查

### 本轮实际检查
- 重新读取当前 handoff，P3.10 已进入最终验证阶段。
- 检查 `package.json`：项目要求 Node >=22，并提供 `build`、`test:react`、`test` 等脚本。
- 检查 `.github/workflows/build-apk.yml`：仅监听 `main` push + 手动触发，不监听当前 `ai-handoff/playback-phase1`，因此本分支提交不会自动产生 CI build。
- 检查当前分支对应 commit 的 workflow runs：没有可用的 Actions 运行记录。
- 因而本轮没有伪造“build/test 已通过”；当前 GitHub connector 也不能直接提供本分支任意 workflow_dispatch 执行能力。

### 结论
当前最合理动作不是继续修改播放架构，而是把源码静态验证收口，并等待实际 Node/npm 或 CI 执行环境。当前分支仍没有运行时证据支持以下结论：
- Vite build 成功；
- architecture tests 成功；
- React boundary tests 成功；
- 浏览器播放器真实 fallback / completed / fullscreen 行为成功。

### P3.10 静态收口项
在等待运行环境期间，只继续处理**不会改变既有播放架构**的确定性问题；不再扩展新 controller / state machine 功能。任何后续 UI polish 必须建立在 build/test 结果之上。

### 下一步
1. 有 Node >=22 环境后执行：
   - `npm install --no-audit --no-fund`
   - `npm run build`
   - `npm run test:react`
   - `npm test`
2. 有浏览器环境后执行 playback smoke matrix：Home/Movies/Search/Detail → Play → Back、resume、completed → next、fallback、manual source、retry、stop/leave、fullscreen/orientation。
3. 若测试发现具体失败，再按失败用例最小范围修复；不要在未验证前继续大规模重构。
