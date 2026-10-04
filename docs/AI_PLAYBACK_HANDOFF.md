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
