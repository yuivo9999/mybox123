# AI Playback Handoff / 无限接力工作台

> 本文件是本仓库影视/直播播放链路的长期 AI 接力记录。  
> **任何下一位 AI 开始工作前必须先读本文件；完成工作后必须更新本文件，并把未完成事项、验证状态、下一步文件位置写清楚。**
>
> 当前基线：`main` @ `f7bac03c395ef71a1bb955ddc2ad7e6f059ac49c`  
> 基线提交：`feat(live): support multiple stream lines in TXT parser`  
> 本轮日期：2026-10-05

---

## 1. 给下一位 AI 的第一条命令

不要从 UI 美化开始，也不要凭文件名猜功能。

严格按下面顺序：

1. 先读取本文件。
2. 再重新读取当前 `main` 的 HEAD SHA，确认本文件之后有没有其他 AI 提交。
3. 检查本文件中“本轮完成”与代码是否一致；如果不一致，以代码为准并修正记录。
4. 优先处理 **P0 播放生命周期 / 状态单一事实源 / 切台竞态 / 释放链**。
5. 每完成一个逻辑闭环，先验证，再更新本文件。
6. 不要一次性大规模重写 playback 架构。先修最危险的生命周期问题，再做结构收敛。
7. 每次结束前必须留下“下一位 AI 可以直接继续”的文件级任务清单。

---

# 2. 当前已确认的真实架构

当前仓库不是旧的简单页面结构，而是已经存在一套播放基础设施：

`LiveFeature / PlaybackPage`
→ `playbackService`
→ `createPlaybackTask`
→ `playbackCore`
→ `player adapter`
→ HTML5 / Native
→ HLS.js 或 Android Bridge

主要文件：

- `src/features/live/LiveFeature.jsx`
- `src/features/live/Tv1LiveFeature.jsx`
- `src/services/liveService.js`
- `src/services/tv1LiveService.js`
- `src/services/playbackService.js`
- `src/playback/playbackCore.js`
- `src/playback/playbackStateMachine.js`
- `src/playback/playbackSessionManager.js`
- `src/playback/playbackResourceManager.js`
- `src/playback/playbackTaskRegistry.js`
- `src/playback/playbackNetworkPolicy.js`
- `src/playback/playbackErrorPolicy.js`
- `src/playback/playbackEventBus.js`
- `src/playback/playbackEventProtocol.js`
- `src/player/playerInterface.js`
- `src/player/html5PlayerAdapter.js`
- `src/player/nativePlayerAdapter.js`
- `src/pages/PlaybackPage.jsx`
- `src/app/App.jsx`
- `src/state/sessionStateStore.js`
- `src/state/pageStateStore.js`
- `src/state/persistentStateStore.js`

已有静态架构测试：

- `tests/architecture/test-runner.mjs`
- `tests/react/page-boundaries.test.mjs`

`package.json` 中多个 `test:*` 脚本目前都指向同一个 architecture runner，因此**脚本名字很多不等于测试覆盖很多**，后续必须核实真实覆盖率。

---

# 3. 本轮已经完成的审查

本轮没有直接修改播放核心代码；完成的是 **P0 代码审查 + 接力文档建立**。

已实际读取：

- `LiveFeature.jsx`
- `playbackService.js`
- `playbackCore.js`
- `playbackSessionManager.js`
- `playbackStateMachine.js`
- `playbackResourceManager.js`
- `html5PlayerAdapter.js`
- `nativePlayerAdapter.js`
- `PlaybackPage.jsx`
- `App.jsx`
- `sessionStateStore.js`
- `pageStateStore.js`
- `persistentStateStore.js`
- `tests/architecture/test-runner.mjs`
- `package.json`

---

# 4. P0 已确认的重要问题 / 风险

## P0-A：LiveFeature 自己持有一套播放状态，并动态创建 controller

文件：`src/features/live/LiveFeature.jsx`

目前存在：

- `playbackCandidate`
- `playbackStatus`
- `playbackError`
- `resolvedPlaybackInput`
- `activeStreamIndex`
- `livePlaybackRequest`
- `playbackController`

其中：

`livePlaybackRequest = playbackService.createLiveRequest(...)`

随后：

`playbackController = playbackService.createController(...)`

而 controller 的依赖包含：

`[livePlaybackRequest, activeChannel, activeStreamIndex]`

这意味着**切线路时 activeStreamIndex 变化会导致 controller 重新创建**。

同时 controller 的 effect：

- attachPlayer
- start
- resolveAndLoad
- cleanup 时 leave

因此必须重点验证：

> 切线路是否真的只切当前播放 session，还是会经历旧 controller release/新 controller 创建/重新 start 的完整生命周期。

这是当前最高优先级之一。

### 必须验证的场景

1. A 频道线路 1 播放。
2. 切线路 2。
3. 快速连续点击线路 1 → 2 → 3。
4. 切频道 A → B。
5. A 的异步 resolve 尚未完成时切到 B。
6. A 失败回调晚到，不能污染 B。
7. 离开直播页后旧事件不能重新把页面状态改成 playing/error。
8. Android Native bridge 的旧事件不能污染新 session。

---

# 5. P0-B：LiveFeature 的自动 fallback 存在潜在重复控制风险

`LiveFeature.jsx` 中 `onPlayerError` 会：

- setPlaybackError
- 修改 `activeStreamIndex`
- 找下一 candidate
- 调 `playbackController.switchCandidate(...)`

但 controller 本身的 `playbackCore` 在 player error 后也会：

- classify error
- recover / retry
- failAndResolve
- task.fail
- next candidate
- resolveAndLoad

所以必须确认：

> LiveFeature 层 fallback 与 playbackCore 层 fallback 是否会对同一次失败各自执行一次。

如果会出现双重切线、跳线两次、重复 load、状态抖动，这是 P0。

**下一位 AI 不要先删除其中一层。先用事件链确认实际行为，再决定 fallback 的唯一 owner。**

建议目标：

- 播放核心负责“播放可靠性策略”；
- UI 只负责展示结果和用户主动选线；
- 自动 fallback 最终只允许一个 owner。

---

# 6. P0-C：playbackResourceManager 已提供单资源 owner，但必须验证与 controller 生命周期的关系

文件：

`src/playback/playbackResourceManager.js`

它会在新 task acquire 时：

1. release 前 owner；
2. 调 `registry.stopAndRelease(previous)`；
3. 新 task 成为 owner。

这是正确方向，但必须继续检查：

- `playbackTaskRegistry` 的实现；
- release 是否真的到 adapter；
- native bridge 是否真的 stop/release；
- 旧 HLS instance 是否 destroy；
- 旧 DOM listener 是否 remove；
- 旧异步 resolve 是否还能继续；
- 新 controller 建立前旧 controller 是否已经完全失效。

尤其要检查：

`playbackResourceManager.acquire()`
→ `registry.stopAndRelease()`
→ player.release()
→ Hls.destroy()
→ event listeners remove

这一条链。

---

# 7. P0-D：Native Player 使用全局 callback，存在旧 session 事件污染风险

文件：

`src/player/nativePlayerAdapter.js`

当前做法：

`window.TVBoxWebView.onPlayerEvent = eventHandler`

release 时只有在：

`window.TVBoxWebView.onPlayerEvent === eventHandler`

才 delete。

这比无条件 delete 安全，但仍然需要确认：

- 多 adapter 创建时后一个会覆盖前一个；
- Android event payload 是否携带 session/task/player id；
- 旧 native player release 后是否可能晚到事件；
- 新 adapter 是否可能收到旧播放器事件。

如果 bridge 不能区分 session，应该增加**adapter/session generation guard**，而不是仅依赖 callback 引用。

---

# 8. P0-E：HTML5/HLS 的 headers 能力存在明确边界

文件：

`src/player/html5PlayerAdapter.js`

当前会在有 custom headers 时发出：

`requestContextIgnored / HTML5_VIDEO_CANNOT_SET_CUSTOM_HEADERS`

这不是普通 warning，而是实际能力差异：

- Native adapter 支持 headers/cookies/referer/user-agent；
- HTML5 video 不能直接给媒体请求设置任意 HTTP headers。

下一位 AI 必须检查：

1. live source 中有多少 candidate 依赖 Referer / User-Agent / Cookie；
2. 浏览器模式是否会因为 headers 被忽略而失败；
3. 是否应该在 capability resolution 阶段就选择 native / proxy / compatible candidate；
4. 是否现在存在“先失败再 fallback”的无意义请求；
5. TVBox/Android 与 Web 的行为是否应该在 request candidate 层明确标注。

**不要简单把 warning 删除。**

---

# 9. P0-F：HLS live buffer 策略必须重新验证真实直播延迟

当前 HLS 配置在 `html5PlayerAdapter.js` 中包含：

- `lowLatencyMode: false`
- `backBufferLength: 60`
- live 初始 `maxBufferLength: 20`
- `maxMaxBufferLength: 120`
- `liveSyncDurationCount: 6`
- `liveMaxLatencyDurationCount: 30`

并且 `FRAG_LOADED` 后会把：

`hls.config.maxBufferLength = 60`

代码注释明确写了希望抗抖动、形成 60 秒提前量。

这不是已经确认的 bug，但对于“直播”来说必须做产品级判断：

- 直播观看者到底要求低延迟还是稳定；
- 60 秒 buffer 是否导致明显追不上直播；
- `liveSyncDurationCount/liveMaxLatencyDurationCount` 与实际行为是否冲突；
- 不同 CDN/playlist target duration 下是否稳定。

**状态：PENDING，不得直接标 FAIL。**

---

# 10. P0-G：playbackSessionManager 中存在明显可疑 API

文件：

`src/playback/playbackSessionManager.js`

当前：

`const get = () => null;`

但同时存在：

- `getRaw(sessionId)`
- `has(sessionId)`
- `isExpired(sessionId)`
- `requestContext(sessionId)`
- `clear(sessionId)`

目前搜索没有找到 `playbackSessionManager.get` 的调用者，因此：

- 不能直接断言这是线上 bug；
- 但它非常像未完成/占位 API；
- 后续必须确认是否应该改为 `get(sessionId)`；
- 如果没有任何调用者，应考虑删除而不是保留假的 API。

**状态：PENDING。**

---

# 11. P0-H：Live 页面和沉浸播放页是两套 UI 播放入口，必须明确产品边界

`LiveFeature.jsx` 自己直接渲染：

`SangtianPlayerWindow`

同时 `App.jsx` 中：

`route === 'live-play' ? <PlaybackPage kind="live" ... />`

也就是说当前至少存在：

1. 直播频道页内嵌播放器；
2. 独立 live PlaybackPage 沉浸播放器。

这不一定是重复功能。

合理解释可能是：

- 内嵌播放器：快速选台；
- 沉浸页：完整播放体验。

但必须验证：

- 两者是否使用完全一致的 controller 生命周期；
- 两者 UI 功能是否重复；
- 从 A → 内嵌播放 → 沉浸 → 返回是否正确；
- 是否可能同时存在两个 player；
- resource manager 是否能保证只留一个播放 owner；
- returnRoute 是否可靠。

---

# 12. P0-I：路由不是 URL Router，而是 session state

文件：

`src/state/sessionStateStore.js`

状态只有：

- `tab`
- `route`
- `selected`

而 `App.jsx` 使用大量：

- `route === 'live-play'`
- `route === 'live-channel'`
- `selected`
- `selected.metadata.returnRoute`

因此当前导航主要是内存 session state。

这会影响：

- 深链接；
- 刷新恢复；
- Android back；
- 浏览器 back；
- 分享直播频道；
- 外部打开指定频道；
- 多标签页；
- 页面状态与 URL 一致性。

**暂时不要马上改成 React Router。**  
先判断当前产品是否需要 deep-link。如果需要，再设计最小 route serialization，而不是直接大换血。

---

# 13. 当前最高优先级执行顺序

## P0-1：先完成播放生命周期证明

必须画出并验证：

`enter live`
→ `select channel`
→ `resolve streams`
→ `create request`
→ `create controller`
→ `attach player`
→ `start task`
→ `resolve/load`
→ `play`
→ `switch candidate`
→ `error/retry/fallback`
→ `leave`
→ `release`

同时标明每一步唯一 owner。

### 完成标准

- 能明确谁创建 controller；
- 谁负责 task；
- 谁负责 player；
- 谁负责 resource ownership；
- 谁负责 retry/fallback；
- 谁负责页面状态；
- 谁负责最终 release；
- 没有双 owner。

---

## P0-2：验证异步竞态

至少覆盖：

- A resolve → B select；
- A error → B already playing；
- A stream request abort → B request；
- A native callback late → B；
- rapid candidate switching；
- rapid channel switching；
- leave while loading；
- source disabled while playing；
- source removed while playing。

---

## P0-3：补真实 playback lifecycle tests

目前 architecture runner 主要是静态边界检查。

下一位 AI 应增加针对：

- `playbackTask`
- `playbackCore`
- `resourceManager`
- `stateMachine`

的行为测试。

至少验证：

1. acquire A 后 acquire B，A 被释放；
2. release 后不能继续 play；
3. switch candidate 后旧 candidate 不再自动恢复；
4. error recovery 不会无限 retry；
5. exhausted 后进入 error；
6. leave 后 player 已 release；
7. 同一时间最多一个 resource owner。

如果测试环境不能真实创建 HLS/DOM，则把 player adapter mock 化。

---

# 14. 第二优先级：直播业务闭环

P1：

### 直播频道身份

确认以下字段是否始终稳定：

- channelId
- sourceId
- streamId
- candidateId

必须明确：

`channel identity != stream identity != playback candidate identity`

尤其最近 HEAD 刚加入“同频道多线路”。

### EPG

检查：

- `liveService.getEPG`
- channel.epg
- current program
- next program
- timezone
- startAt/endAt 类型
- EPG refresh
- channel switch 后旧 EPG 请求是否污染新频道

### 收藏

确认：

- channel favorite
- source + channel identity
- 删除 source 后收藏是否变成孤儿
- favorite → open → live channel → playback 是否闭环

### 历史

确认：

- `recordLivePlay`
- history 的 channel/source/stream 信息
- 从历史重新进入时能否恢复有效 candidate

---

# 15. 第三优先级：路由与返回栈

重点文件：

- `src/app/App.jsx`
- `src/state/sessionStateStore.js`
- `src/pages/PlaybackPage.jsx`
- `src/features/live/LiveFeature.jsx`

建立明确导航矩阵：

| 当前 | 操作 | 目标 |
|---|---|---|
| 直播列表 | 点频道 | live-channel 或内嵌播放 |
| live-channel | 播放 | live-play |
| live-play | 返回 | live-channel |
| live-play | 返回且无来源页 | live |
| live-play | 切台 | 当前播放页切台 |
| live | 沉浸播放 | live-play |
| favorite | 频道 | live-channel |
| history | 频道 | live-channel/live-play |
| Android back | live-play | 上一级 |
| swipe back | live-play | 上一级 |
| refresh | live-play | 当前是否可恢复 |

任何“不明确”都记为 PENDING，不要假装 PASS。

---

# 16. 第四优先级：Web / Android 播放能力矩阵

必须建立表格：

| 能力 | HTML5 | HLS.js | Native |
|---|---|---|---|
| HLS | ? | ? | ? |
| MP4 | ? | ? | ? |
| RTMP | ? | ? | ? |
| RTSP | ? | ? | ? |
| custom headers | NO | manifest/fetch 层需验证 | YES |
| cookies | 浏览器 cookie 规则 | 需验证 | YES |
| referer | 不能任意设置 | 需验证 | YES |
| seek | ? | ? | ? |
| quality | 部分 | manifest variants | bridge |
| audio tracks | ? | ? | 当前 native false |
| subtitle | ? | ? | 当前 native false |
| reconnect | HLS 自己处理 | HLS + core | bridge |

然后决定 candidate capability filtering 应该在哪里做。

---

# 17. 第五优先级：UI/UX，而不是现在

等 P0 播放稳定后再做：

- 直播播放页信息层级；
- 当前节目；
- 线路切换；
- 收藏；
- 选台；
- 全屏；
- 错误状态；
- 重试；
- 加载状态；
- 移动端；
- TV D-pad；
- 键盘；
- 无障碍；
- 横屏；
- immersive；
- native video bounds。

原则：

> 不要为了“看起来更漂亮”重写已经正确的播放生命周期。

---

# 18. 不允许下一位 AI 做的事情

1. 不允许凭文件名认定 dead code。
2. 不允许看到 `.gitkeep` 就删除目录。
3. 不允许未经调用链证明就删除 `globalLiveCache`。
4. 不允许把 Live / VOD 两条链强行合并成一个页面。
5. 不允许为了统一 UI 把内嵌播放和沉浸播放直接砍掉一个。
6. 不允许未经验证直接把 HLS buffer 改小/改大。
7. 不允许未经验证直接删除 native bridge。
8. 不允许只修 React UI 而不检查 player release。
9. 不允许只改一个文件而不检查它的 caller/callee。
10. 不允许把 UNKNOWN/PENDING 写成 FAIL。
11. 不允许一次大重构超过当前 P0 的验证范围。
12. 不允许结束工作而不更新本文件。

---

# 19. 每一轮 AI 必须留下的交接格式

每次完成工作后，必须在本文件追加/更新：

## 本轮
- 日期：2026-10-05
- HEAD SHA：75f786036e6ac4fd257e5374e1e34bda37eb1fac
- 工作范围：P0 播放异步生命周期竞态的第一处修复 + 建立长期接力文档
- 修改文件：\`src/playback/playbackCore.js\`、\`docs/AI_PLAYBACK_HANDOFF.md\`
- 修改原因：旧的 resolve/reconnect 在等待期间可能遇到切台/stop/release；此前没有 generation guard，旧异步操作有机会继续碰新 player 或已释放 task。

## 已完成
- [x] ...
- [x] ...

## 已验证
- [x] 静态测试：
- [x] 行为测试：
- [ ] 浏览器真实播放：
- [ ] Android 真实播放：
- [ ] HLS 实源：
- [ ] 多线路快速切换：

## 当前剩余问题

### P0
- [ ] 问题
  - 文件：
  - 现象：
  - 根因：
  - 下一步：
  - 验收：

### P1
- [ ] ...

### P2
- [ ] ...

## 当前不能确定
明确写 UNKNOWN / PENDING，并说明需要什么证据。

## 下一位 AI 立即执行

只写 3~8 条，按优先级排序，每条必须有文件路径。

## 给下下一位 AI 留的资料

如果本轮无法完成某项，必须写：

- 已查到什么；
- 没查到什么；
- 已经排除什么；
- 下一步应该搜索什么；
- 不要重复做什么；
- 需要真实设备/浏览器还是只需代码分析。

---

# 20. 无限接力原则

这个项目不是“一个 AI 做完一次就结束”。

每一个 AI 都应该把自己当成：

> **维护中的高级工程师 + 下一位 AI 的技术交接负责人**

因此：

- 不追求本轮把所有问题做完；
- 追求每轮减少未知；
- 追求每轮增加可验证事实；
- 追求每轮缩小下一位 AI 的搜索范围；
- 追求每轮保留可回溯的设计理由；
- 任何未完成工作都必须变成结构化 TODO；
- 任何已经完成工作都必须写验收标准；
- 任何不确定的判断都必须标 UNKNOWN/PENDING；
- 任何删除/重构都必须写明为什么；
- 任何“以后再做”的事情必须有文件路径和触发条件。

**下一位 AI 不应该从零开始理解项目。**

如果下一位 AI 读完本文件后还不知道：

> “我现在应该先打开哪个文件、看哪一段、验证什么、完成后改哪里”

则本轮交接失败。

---

# 21. 当前交接点

**当前状态：P0 审查已经开始，但 P0 代码修复尚未完成。**

下一位 AI 不要重新做一遍泛泛的项目审查。

直接从：

1. `src/features/live/LiveFeature.jsx`
2. `src/playback/playbackCore.js`
3. `src/playback/playbackResourceManager.js`
4. `src/playback/playbackTaskRegistry.js`
5. `src/player/nativePlayerAdapter.js`
6. `src/player/html5PlayerAdapter.js`
7. `src/pages/PlaybackPage.jsx`

开始。

**第一目标：证明“快速切台 + 异步回调 + release”不会串台。**

证明后再修改。

---

# 22. 最终目标

最终不是“播放器能播”这么简单。

最终必须证明整个直播产品链：

`源管理`
→ `直播源加载`
→ `频道解析`
→ `频道身份`
→ `频道详情`
→ `EPG`
→ `收藏`
→ `历史`
→ `线路候选`
→ `播放请求`
→ `解析/能力判断`
→ `播放器`
→ `切台`
→ `重试`
→ `断线恢复`
→ `退出`
→ `释放`
→ `重新进入`

在：

- Web
- Android
- 移动端
- Desktop
- TV / D-pad
- 横竖屏
- 弱网
- 源失效
- 多线路
- 快速切换
- 页面返回
- App 后台/前台

下都能形成完整闭环。

**任何一项没有证据，就继续标记为 PENDING。**


---

# 23. 本轮新增的 P0 修复：异步 operation generation guard

提交：`75f786036e6ac4fd257e5374e1e34bda37eb1fac`

修改：`src/playback/playbackCore.js`

已加入：

- `operationGeneration`
- `isCurrentOperation(generation)`
- `resolveAndLoad()` 在 await 前后检查 generation
- `recover()` 在 reconnect delay 后再次检查
- retry/reconnect 完成后检查 operation 是否仍然有效
- `switchCandidate()` 会递增 generation
- `stop()` 会递增 generation
- `release()` 会递增 generation

目的：

> 当旧播放操作已经被新线路、stop 或 release 取代时，旧 async operation 不再继续向 player 执行 load/play，也不会在 reconnect delay 后重新污染当前播放。

### 重要：本修复尚未完成全部验证

当前只是代码级修复，必须继续补：

- [ ] 自动化测试：旧 resolve 在 switch 后完成，不得 load 到新 player
- [ ] 自动化测试：reconnect delay 期间 release，不得重新 load
- [ ] 自动化测试：stop 后旧 retry 不得继续
- [ ] 自动化测试：rapid switch A→B→C 最终只允许 C 生效
- [ ] 浏览器真实 HLS 验证
- [ ] Android Native 真实事件验证

下一位 AI **不要删除 generation guard**，除非能用更完整的 AbortSignal/session-token 机制替代并保留同等生命周期保证。



---

# 24. 本轮继续执行结果：P0 生命周期竞态进入“有行为测试”阶段

## 本轮
- 日期：2026-10-05
- HEAD SHA：`4135e676e8c4ad2021e2dac03d5888292e182822`
- 工作范围：继续完成 P0-2/P0-3；围绕 rapid channel/candidate switch、stop、release、Native stale callback 建立可执行行为测试，并修正上一轮 generation guard 中发现的实际竞态缺口。
- 修改文件：
  - `src/playback/playbackCore.js`
  - `tests/playback/playback-lifecycle.test.mjs`
  - `package.json`
  - `tests/architecture/test-runner.mjs`
  - `docs/AI_PLAYBACK_HANDOFF.md`

## 本轮发现并修复

### P0-1：上一版 recover 使用了不存在的 generation 变量
- 文件：`src/playback/playbackCore.js`
- 现象：`recover()` 使用 `generation`，但函数原先没有参数/局部定义。
- 修复：`recover(error, code, generation=operationGeneration)`，并在进入、delay 后、retry 后、fail 前持续检查 generation。
- 状态：已修复，待执行测试确认。

### P0-2：旧 Native player callback 会与新 candidate 共用生命周期
- 文件：`src/playback/playbackCore.js`
- 修复：
  - 增加 `playerGeneration`
  - 每次 `attachPlayer()` 创建新的 callback generation
  - candidate switch 时重新 attach player，使旧 Native/HLS callback 失效
  - callback 同时检查 `playerGeneration` 与 `activePlayerOperationGeneration`
- 目的：A 线路旧事件不能污染 B/C 线路。
- 状态：代码完成，待真实 Native 验证。

### P0-3：stop 后旧 player event 仍可能触发 recover
- 文件：`src/playback/playbackCore.js`
- 修复：stop/release 时让 `activePlayerOperationGeneration` 失效；下一次 start 再重新激活当前 operation。
- 状态：代码完成，待行为测试确认。

### P0-4：旧 resolve 在 Live direct branch 中仍可能先触发 onResolvedInput
- 文件：`src/playback/playbackCore.js`
- 修复：Live direct resolve 也使用 `__operationGeneration` token，在调用 `onResolvedInput` 前检查 operation 是否仍有效。
- 同时 parser/VOD branch 的 stale resolved input 也受到同一 token 保护。
- 状态：代码完成。

## P0-3 行为测试已建立

新增：
- `tests/playback/playback-lifecycle.test.mjs`

覆盖：
1. Resource manager：A owner → B owner，A 必须 stop + release。
2. A 加载未完成 → switch B，A 不得 prepare/play。
3. A → B → C 快速切换，只有 C 可以到 prepare/play。
4. stop 后 pending load 不得继续 prepare/play。
5. release 后 pending load 不得继续 prepare/play。
6. 旧 Native callback 在 switch 后必须被忽略。

新增脚本：
- `npm run test:playback-lifecycle`

架构测试也已调整：
- `test:playback` 不再被强制伪装成 architecture runner；
- architecture runner 改为检查真正的 `test:playback-lifecycle` 行为测试脚本存在。

## 验证状态

### 已完成
- [x] 当前 main HEAD 已重新读取，确认本轮提交没有被其他 AI 插入覆盖。
- [x] P0 generation guard 代码已继续收敛。
- [x] 行为测试文件已加入仓库。
- [x] `package.json` 已有独立 playback lifecycle test script。
- [x] architecture runner 已与独立行为测试脚本对齐。

### 尚未执行
- [ ] `npm run test:playback-lifecycle`
- [ ] `npm test`
- [ ] 浏览器真实 HLS
- [ ] Android Native 真实播放
- [ ] HLS 实源 rapid switch
- [ ] 真机后台/前台恢复
- [ ] 弱网 reconnect

本轮执行环境无法从 GitHub clone 仓库，因此**没有伪造“测试通过”结论**。以上行为测试属于已提交、待运行状态。

## 当前剩余问题

### P0
- [ ] **P0-A：LiveFeature fallback ownership 未完成闭环**
  - 文件：`src/features/live/LiveFeature.jsx`
  - 现象：需要继续确认 UI 层 `onPlayerError`/线路切换 与 core `recover/failAndResolve` 是否会双重 fallback。
  - 下一步：沿 event → hook → controller → task.fail → resolveAndLoad 路径逐调用链确认。
  - 验收：同一次 player error 最多发生一次自动 candidate transition。

- [ ] **P0-B：Resource manager → controller → adapter release 真实链尚未设备验证**
  - 文件：`src/playback/playbackResourceManager.js`、`src/playback/playbackTaskRegistry.js`、`src/playback/playbackCore.js`、`src/player/nativePlayerAdapter.js`、`src/player/html5PlayerAdapter.js`
  - 验收：A→B 切换后 A 的 HLS instance、DOM listeners、Native callback、task 都已失效。

- [ ] **P0-C：Native bridge 的事件身份仍未知**
  - 文件：`src/player/nativePlayerAdapter.js`
  - 当前只能证明旧 adapter callback 自身可以被 generation 隔离；尚未证明 Android bridge event payload 是否带 task/session/player identity。
  - 验收：拿到 bridge 实际 event payload 或 Android 实现后，明确是否需要 payload-level session token。

### P1
- [ ] HTML5 custom headers / candidate capability filtering
- [ ] HLS live latency/buffer 策略
- [ ] PlaybackPage / LiveFeature 两套播放入口的资源与导航边界
- [ ] live channel / stream / candidate identity
- [ ] EPG stale request isolation

### P2
- [ ] URL/deep-link/back stack
- [ ] Web/Android/TV capability matrix
- [ ] UI/UX polish

## 当前不能确定
- **PENDING**：行为测试是否在真实 Node 22 + 完整依赖环境通过；需要执行 `npm install` 后运行 `npm run test:playback-lifecycle`。
- **PENDING**：Android bridge 是否能提供 session/player identity；需要真实 bridge payload 或 Android 侧代码。
- **PENDING**：切换 candidate 时重建 adapter 对实际 HLS/Native 的成本与副作用；需要浏览器/真机验证。
- **PENDING**：LiveFeature 与 playbackCore 是否双重 fallback；目前不能仅凭代码片段断言。

## 下一位 AI 立即执行
1. `tests/playback/playback-lifecycle.test.mjs`：先实际运行 `npm run test:playback-lifecycle`，修测试本身的环境/断言问题，不要把未运行写成 PASS。
2. `src/features/live/LiveFeature.jsx` + `src/playback/playbackCore.js`：完整追踪一次 `onPlayerError → recover → failAndResolve → onCandidateChange`，确认 fallback 唯一 owner。
3. `src/playback/playbackResourceManager.js` + `src/playback/playbackTaskRegistry.js` + `src/playback/playbackCore.js`：验证 A→B 释放顺序与 registry owner 是否可能出现旧 task 残留。
4. `src/player/nativePlayerAdapter.js`：确认 Android event payload 是否带 task/session/player identity；没有则评估 bridge-safe token。
5. `src/player/html5PlayerAdapter.js`：继续检查 candidate switch 重建 HLS 的 listener/destroy 完整性。
6. 只有 P0 闭环后，再进入 EPG、路由、能力矩阵与 UI。

## 给下下一位 AI 留的资料
- 不要重复建立 generation guard；当前已经有 operation generation + player generation + active operation generation 三层保护。
- 不要删除 candidate switch 时的 adapter reattach，除非找到更可靠的 session identity/AbortSignal 机制。
- 不要把行为测试脚本重新指回 architecture runner；这正是本轮修复的测试基础设施问题。
- 当前最大未知不是“有没有 generation guard”，而是**fallback owner 是否唯一、Native bridge 是否有可区分 session、以及实际测试是否通过**。
- 浏览器/Android 真机验证仍然没有完成，不能把代码级 PASS 当成产品级 PASS。


---

# 25. 本轮继续执行结果：P0-A fallback owner 收敛 + controller 生命周期修正

## 本轮
- 日期：2026-10-05
- 起始 HEAD：`cee1ddcabd28c723f52fc44799753e8257e346f2`
- 本轮代码提交：`7dc141f65a6a027e1f0b3a912350d4c6f9167041`
- 工作范围：继续执行 P0-A；沿 `LiveFeature → playbackCore → recover → failAndResolve → onCandidateChange` 追踪自动 fallback，并检查线路切换是否意外重建 controller。
- 修改文件：
  - `src/features/live/LiveFeature.jsx`
  - `docs/AI_PLAYBACK_HANDOFF.md`

## 已确认的 P0-A 根因
### 1. 自动 fallback 的唯一 owner 应为 playbackCore/task
实际调用链：

`player error`
→ `playbackCore.handlePlayerEvent()`
→ `recover()`
→ retry/reconnect
→ `failAndResolve()`
→ `task.fail()`
→ `hooks.onCandidateChange(next)`
→ `resolveAndLoad(next)`

因此 LiveFeature 不应该在 `onPlayerError` 中再次调用 `switchCandidate()`。

此前 LiveFeature 的 `onPlayerError` 会自行递增 `activeStreamIndex` 并调用 `playbackController.switchCandidate()`。这会让 UI 层和 playbackCore 同时拥有自动 fallback 控制权；尤其当 core 已经切到下一个 candidate、但该 candidate 的再次 load 又失败时，UI 可能继续切到下下个 candidate。

### 2. 更严重的隐藏问题：activeStreamIndex 被错误地作为 controller 生命周期依赖
此前：

`useMemo(createController, [livePlaybackRequest, activeChannel, activeStreamIndex])`

而 core 的 `onCandidateChange` 本身就会更新 `activeStreamIndex`。

结果是：

`candidate switch`
→ `setActiveStreamIndex()`
→ React rerender
→ controller useMemo dependency 变化
→ 旧 controller cleanup/leave
→ 新 controller create/start

这会把一次正常的 candidate switch 放大成一次 controller 销毁/重建，破坏 playbackCore 已经建立的 operation/player generation 生命周期隔离。

## 本轮修复
### P0-A-1：LiveFeature 不再执行自动 fallback
`onPlayerError` 现在只负责展示最终逃逸到 UI 层的错误，不再：
- 修改 `activeStreamIndex`
- 调 `switchCandidate()`
- 参与自动 retry/fallback

自动 fallback 的唯一 owner：

**`playbackCore + playbackTask`**

### P0-A-2：controller 生命周期只跟随 playback request
`playbackController` 的 memo dependency 从：

`[livePlaybackRequest, activeChannel, activeStreamIndex]`

收敛为：

`[livePlaybackRequest]`

这样用户主动切线路或 core 自动 fallback 时，candidate 变化不会重新创建 controller。

### P0-A-3：保留 onCandidateChange 作为 UI 同步点
core 切换 candidate 后仍调用：

`hooks.onCandidateChange(next)`

LiveFeature 继续通过它更新：
- `playbackCandidate`
- `activeStreamIndex`
- 清理旧错误展示

但这些只是**显示状态同步**，不再反向控制 playbackCore。

## 代码级结论
- [x] 已确认 UI fallback 与 core fallback 存在双 owner 风险。
- [x] 已删除 UI 层自动 candidate transition。
- [x] 已解除 `activeStreamIndex → controller recreation` 的生命周期耦合。
- [x] core 的 generation guard 不需要因此修改。
- [x] resource manager / task registry 仍作为单资源 owner 机制保留。

## 验证状态
- [x] 已重新读取当前 main HEAD，确认从上一轮 `cee1ddc...` 开始没有其他 AI 插入提交。
- [x] 已完成代码级调用链审查。
- [ ] `npm run test:playback-lifecycle`：本环境尚未执行，不能标 PASS。
- [ ] `npm test`：本环境尚未执行。
- [ ] 浏览器真实 HLS：PENDING。
- [ ] Android Native 真实播放：PENDING。
- [ ] 真机 rapid switch：PENDING。

## 当前剩余问题
### P0
- [ ] **P0-B：resource manager → task registry → adapter release 仍需真实验证**
  - 文件：`src/playback/playbackResourceManager.js`
  - `src/playback/playbackTaskRegistry.js`
  - `src/playback/playbackCore.js`
  - 验收：A→B acquire 后 A 的 stop/release 顺序稳定，且 registry 不残留 A。

- [ ] **P0-C：Native bridge event identity 仍 UNKNOWN**
  - 文件：`src/player/nativePlayerAdapter.js`
  - 当前已确认：旧 adapter callback 可以由 core 的 player generation 隔离。
  - 仍未知：Android bridge payload 是否携带 player/session/task identity。
  - 下一步：搜索 Android/WebView bridge 定义和所有 `onPlayerEvent` 写入点。

- [ ] **P0-D：candidate switch 重建 adapter 的实际设备成本仍 PENDING**
  - 文件：`src/playback/playbackCore.js`
  - 代码层仍使用 reattach 来隔离旧 callback。
  - 需要浏览器/Android 验证 HLS destroy/rebind 与 Native release/load 的实际行为。

### P1
- [ ] HTML5 custom headers / candidate capability filtering
- [ ] HLS live latency/buffer 策略
- [ ] PlaybackPage / LiveFeature 双入口边界
- [ ] live channel / stream / candidate identity
- [ ] EPG stale request isolation

## 当前不能确定
- **PENDING**：behavior tests 是否通过，需要真实依赖环境执行。
- **PENDING**：Native bridge 是否带 session/player identity。
- **PENDING**：candidate switch reattach 在真实设备上的性能与副作用。

## 下一位 AI 立即执行
1. `tests/playback/playback-lifecycle.test.mjs`：实际运行 `npm run test:playback-lifecycle`，如果失败先修测试/环境，不要改成静态伪通过。
2. `src/playback/playbackResourceManager.js` + `src/playback/playbackTaskRegistry.js`：继续验证 resource owner 与 registry 的 stop/release 顺序，补缺失行为测试。
3. 全仓搜索 `TVBoxWebView.onPlayerEvent`、`onPlayerEvent`、`loadMedia`、`releaseMedia`，定位 Android/WebView bridge 的真实事件来源。
4. `src/player/nativePlayerAdapter.js`：如果 bridge payload 没有 identity，设计不破坏现有 bridge 的最小 token 隔离方案。
5. `src/player/html5PlayerAdapter.js`：继续验证 HLS destroy/rebind、listener cleanup 与 stale event。
6. P0 未闭环前不要进入 UI 美化、路由大重构或 HLS 参数调整。

## 给下下一位 AI 留的资料
- P0-A 已经不再是“未知”：代码审查确认了双 owner 风险，并已把自动 fallback 唯一化到 playbackCore/task。
- 一个关键架构事实已经修正：`activeStreamIndex` 是 UI 选择状态，不应成为 playbackController 生命周期依赖。
- 不要恢复 LiveFeature `onPlayerError → switchCandidate` 的自动 fallback。
- 不要把 `activeStreamIndex` 加回 controller 的 useMemo dependencies。
- 下一阶段重点已经明确转到 resource release 链与 Native bridge event identity；不要重复做 fallback owner 审查。

# 26. 本轮继续执行结果：P0-B stop/restart 生命周期收敛

## 本轮
- 日期：2026-10-05
- 起始 HEAD：4d3043f37858ff27829a21d2d7566db1ffa46f9f
- 本轮代码提交：82c5ae2bef97a577d116545f219885c784954f7a
- 本轮测试提交：0fa62ac14b321094e1b7ac43cf14f92f0bf9f8a6
- 工作范围：继续执行 P0-B；沿 stop → resource owner → task registry → adapter → start/restart 检查生命周期，修复 stop 后同一 controller 无法可靠 restart 的问题，并增加行为测试。
- 修改文件：
  - src/playback/playbackCore.js
  - tests/playback/playback-lifecycle.test.mjs
  - docs/AI_PLAYBACK_HANDOFF.md

## 本轮发现
### P0-B-1：stop() 会过早放弃 resource ownership / registry registration
旧行为：
stop()
→ player.stop()
→ task.stop()
→ resourceRelease()
→ playbackTaskRegistry.unregister(taskId)

这会造成不一致状态：controller 自己仍然存在、player adapter 也仍然存在，但 resource manager 已经认为没有 owner，registry 也无法在后续竞争 acquire 时执行 stopAndRelease(previous)。

更重要的是，同一 controller 后续调用 start() 时，原来的 player callback operation generation 已被 stop 失效，而 start 原先没有重新 attach player，因此 restart 后新的 player event 可能被 core 当成 stale event 忽略。

### P0-B-2：stop 与 release 的职责必须分开
本轮采用的最小修复原则：
- stop() = 用户/调用方要求停止当前播放，但保留 controller + adapter + resource owner + registry，允许后续 start() 重启。
- release() = 真正终结生命周期，释放 adapter、session、event bus、task，并从 registry 移除。
- 当另一个 controller acquire 同一资源时，resource manager 仍可通过 registry 对旧 controller 执行 stopAndRelease()，因此不会因为旧 controller 处于 stopped 状态而失去最终释放能力。

## 本轮修复
### P0-B-3：start() 在 stopped 状态重新绑定 player callback
文件：src/playback/playbackCore.js

当 activePlayerOperationGeneration === null 且 controller 仍有 player context 时，start() 会重新调用 attachPlayer(playerElement)。

这样 restart 会获得新的 playerGeneration / activePlayerOperationGeneration，旧 stop 生命周期不会继续阻断新播放事件。

### P0-B-4：stop() 不再主动 unregister / release resource owner
这样保证：
stop → start
仍是同一个可重启 controller；同时：
old controller stop → new controller acquire
仍可走：
playbackResourceManager → playbackTaskRegistry.stopAndRelease → player.release → task.release
最终释放旧资源。

## 行为测试
新增 tests/playback/playback-lifecycle.test.mjs 场景：
1. A 正常播放；
2. A stop；
3. A start；
4. A 再次 resolve/load/play；
5. 确认第二次 playMedia 成功进入调用链；
6. 最后 release。

## 验证状态
- [x] 代码已提交到 main。
- [x] GitHub main HEAD 已重新读取，当前为 0fa62ac14b321094e1b7ac43cf14f92f0bf9f8a6。
- [x] commit status 已查询；当前没有任何 status/check 返回，因此不能据此声称测试通过。
- [ ] npm run test:playback-lifecycle：仍未在真实 Node 22 + 完整依赖环境执行。
- [ ] npm test：仍未执行。
- [ ] 浏览器真实 HLS：PENDING。
- [ ] Android Native 真实播放：PENDING。
- [ ] 真机 rapid switch：PENDING。

## 当前 P0
### P0-B
- [x] stop/restart controller 生命周期代码级闭环已补齐。
- [ ] A→B acquire 后旧 stopped controller 是否在真实运行时稳定执行 stop + release。
- [ ] HTML5 HLS destroy/rebind 的真实行为。
- [ ] Native releaseMedia 后 Android 侧是否真正释放旧 surface/player。

### P0-C
- [ ] Native bridge event identity 仍 UNKNOWN。
  - 必须继续搜索 TVBoxWebView.onPlayerEvent、onPlayerEvent、loadMedia、releaseMedia。
  - 当前仓库代码只能证明 adapter callback generation isolation，不能证明 bridge payload identity。

### P0-D
- [ ] candidate switch reattach 的真实设备成本仍 PENDING。

## P1
- [ ] HTML5 custom headers / candidate capability filtering
- [ ] HLS live latency/buffer 策略
- [ ] PlaybackPage / LiveFeature 双入口资源与导航边界
- [ ] live channel / stream / candidate identity
- [ ] EPG stale request isolation

## 当前不能确定
- PENDING：行为测试是否通过；必须在有依赖的环境执行，不得把代码检查当测试 PASS。
- PENDING：Native bridge 是否携带 session/player identity。
- PENDING：candidate switch reattach 对真实 HLS/Native 的性能、副作用。

## 下一位 AI 立即执行
1. tests/playback/playback-lifecycle.test.mjs：运行 npm run test:playback-lifecycle；如果失败先区分环境失败与代码失败。
2. src/playback/playbackCore.js + src/playback/playbackResourceManager.js + src/playback/playbackTaskRegistry.js：补一个“stopped A 被 B acquire 后必须 release A”的行为测试，证明 stop 后 registry ownership 仍有意义。
3. 全仓搜索 TVBoxWebView.onPlayerEvent / onPlayerEvent / loadMedia / releaseMedia，继续确认 Native bridge 来源。
4. src/player/nativePlayerAdapter.js：若没有 payload identity，设计最小 bridge-safe isolation，不要假设 Android 能配合新字段。
5. src/player/html5PlayerAdapter.js：检查 HLS destroy()、DOM listener cleanup、stale HLS events 在 switch/release 后是否仍可能 emit。
6. P0 未闭环前继续禁止 UI 美化、路由大重构、HLS 参数调整。

## 给下下一位 AI 留的资料
- 本轮不是重新做 generation guard；已有三层 guard：operation generation、player generation、active player operation generation。
- 新确认的架构事实：stop 与 release 不能混为一谈。stop 需要保持 controller 可 restart，同时保留 resource registry ownership，等待新 controller acquire 时再由 registry 完成最终 release。
- 目前最值得继续验证的不是“有没有 release 调用”，而是“旧 stopped controller 是否仍可被 resource manager 找到并彻底释放”。
- Native bridge 的 payload identity 仍没有代码证据，继续保持 UNKNOWN/PENDING。


# 27. 本轮继续执行结果：P0-B stopped owner 被竞争 controller 接管时的释放证明

## 本轮
- 日期：2026-10-05
- 起始有效 HEAD：`0fa62ac14b321094e1b7ac43cf14f92f0bf9f8a6`
- 本轮测试提交：`c08d2200454cf925afd54007281cf165e386f2e5`
- 工作范围：继续执行 P0-B；针对上一轮确定的架构事实，补充“旧 controller 已 stop，但仍持有 resource/registry ownership；新 controller acquire 后必须彻底 release 旧 controller”的行为测试。
- 修改文件：
  - `tests/playback/playback-lifecycle.test.mjs`
  - `docs/AI_PLAYBACK_HANDOFF.md`

## 本轮完成
### P0-B-5：补齐 stopped owner → competing controller 的行为测试
新增场景：

1. Controller A attach + start；
2. A 调用 stop；
3. A 仍然保留在 resource manager / task registry；
4. Controller B attach + start；
5. B acquire playback resource；
6. ResourceManager 找到 A；
7. Registry 执行 A 的 stop + release；
8. A task 最终进入 `released`；
9. Native `releaseMedia` 被调用；
10. B 保持 active，未被误释放。

这直接验证了上一轮的关键设计，而不是只验证“stop 后还能 start”。

## 代码级结论
当前代码链为：

`B.start()`
→ `playbackTaskRegistry.register(B)`
→ `playbackResourceManager.acquire(B)`
→ 发现 owner=A
→ 清除 A owner handle
→ `registry.stopAndRelease(A)`
→ A player.release()
→ A task.release()
→ A 从 registry 删除
→ B 成为 owner

因此“stop 不 release”并不等于“stop 后资源永远泄漏”；竞争 controller acquire 时仍存在最终释放路径。

## 验证状态
- [x] 行为测试已提交：`c08d2200454cf925afd54007281cf165e386f2e5`
- [ ] `npm run test:playback-lifecycle`：仍未在真实 Node 22 + 完整依赖环境执行。
- [ ] `npm test`：仍未执行。
- [ ] 浏览器真实 HLS：PENDING。
- [ ] Android Native：PENDING。
- [ ] 真机 rapid switch：PENDING。
- [ ] Native bridge payload identity：PENDING。

## 当前 P0
### P0-B
- [x] ResourceManager → TaskRegistry 的 stopped-owner 最终释放路径已有行为测试覆盖。
- [ ] 真实 Node 22 执行测试。
- [ ] HTML5 HLS destroy/rebind 真实验证。
- [ ] Native releaseMedia 后 Android 侧 player/surface 是否真正释放。
- [ ] candidate switch 的 adapter reattach 在真实设备上的成本。

### P0-C
- [ ] Native bridge event identity 仍 UNKNOWN。
  - 仓库当前只看到 `src/player/nativePlayerAdapter.js` 写入 `window.TVBoxWebView.onPlayerEvent`。
  - GitHub 代码搜索目前没有找到 Android/WebView bridge 实现或其它 `onPlayerEvent/loadMedia/releaseMedia` 定义。
  - 因此不能假设 payload 有 task/session/player identity。
  - 下一步应优先确认仓库是否包含 Android 原生目录/子模块；若没有，则记录为外部 bridge 依赖并设计 adapter-local isolation，不凭空修改 payload 协议。

### P0-D
- [ ] candidate switch reattach 真实成本仍 PENDING。

## 当前不能确定
- **PENDING**：测试是否实际通过；当前只有代码/测试提交，没有运行结果。
- **UNKNOWN**：Android bridge 是否提供 event identity。
- **PENDING**：HTML5/Native 真实释放效果。

## 下一位 AI 立即执行
1. `package.json` / CI：先确认 Node 22 + 依赖是否可在当前环境运行 `npm run test:playback-lifecycle`；能运行就执行并记录真实结果。
2. `src/player/nativePlayerAdapter.js` + 仓库目录：继续确认 Android 原生 bridge 是否在仓库、子模块或 build 资源中；不要只重复搜索 JS。
3. `src/player/html5PlayerAdapter.js`：针对 candidate switch / release 检查 HLS callback 是否可能在 `cleanupHls()` 后继续 emit；必要时增加 adapter-local generation guard。
4. `src/playback/playbackCore.js`：如果 HTML5/native adapter 都已有 stale-event 隔离，确认 core 的三层 generation guard 是否仍足够，不要重复加 token。
5. 若 P0-C/P0-D 仍无法从仓库获得证据，保持 UNKNOWN/PENDING，转入 P1 的 HTML5 capability boundary，但不要直接调整 HLS buffer。

## 给下下一位 AI 留的资料
- P0-B 现在不仅有代码链，还有一个专门验证“stopped A 被 B acquire 后必须 release A”的行为测试。
- 不要把 `stop()` 改回“立即 unregister + release”，否则会破坏同一 controller restart，以及竞争 controller 的统一 resource ownership。
- Resource manager 的 owner handle 会在 B acquire 时先失效，然后由 registry 对 A 执行 stopAndRelease；这是当前预期行为。
- 当前最重要的未知已经从 resource ownership 进一步收敛到 Native bridge identity 和真实 adapter release 行为。


# 28. 本轮继续执行结果：P0-B/P0-D HTML5 HLS stale callback 隔离

## 本轮
- 日期：2026-10-05
- 起始有效 HEAD：`c08d2200454cf925afd54007281cf165e386f2e5`
- 本轮代码提交：`2fb1f95af518d53a83679bd450261207289fcbf7`
- 工作范围：继续按 P0 优先级检查 `html5PlayerAdapter.js` 的 HLS destroy/rebind 生命周期，并确认仓库是否包含可直接验证 Native bridge 的 Android 实现。

## 本轮发现

### P0-D-1：HLS 实例销毁后，旧实例 callback 仍然闭包引用 adapter 状态
此前 `cleanupHls()` 会：
- detachMedia
- destroy
- `hlsInstance = null`

但旧 HLS 实例注册的 `MEDIA_ATTACHED / MANIFEST_PARSED / FRAG_LOADED / ERROR` callback 没有 adapter-local generation 判断。

虽然 playbackCore 已经有 player generation，可以阻止部分事件继续影响 core，但 adapter 自己的旧 callback 仍可能：
- 修改 `hlsRecoveryCount`
- 修改 `state`
- 修改 `hlsInstance`
- 再次调用 `cleanupHls()`
- emit 一个过时的 `prepared/error`

这属于“core 之外的 stale callback”风险，尤其发生在 candidate switch 快速 destroy → create HLS 时。

## 本轮修复

新增 HTML5 adapter-local `hlsGeneration`：

- 每次 `cleanupHls()` 都使旧 HLS generation 失效。
- 每次创建新的 HLS instance 后生成 `currentHlsGeneration`。
- HLS callbacks 统一先检查：
  - adapter 未 released；
  - generation 仍匹配；
  - `hlsInstance === hls`。
- 不满足条件直接 return。

因此旧 HLS 实例即使在 destroy/rebind 后仍有延迟 callback，也不能继续操作当前 adapter 的新播放实例。

### 为什么没有再增加 core token
这是 adapter 内部实例生命周期问题。

当前隔离层级为：
1. HTML5 adapter：`hlsGeneration` 防止旧 HLS 实例污染新 HLS 实例；
2. playbackCore：`playerGeneration` 防止旧 adapter callback 污染新 adapter；
3. playbackCore：`operationGeneration` 防止旧 async operation 污染新 playback operation；
4. playbackCore：`activePlayerOperationGeneration` 防止 stop 后同 adapter event resurrect recovery。

这四层职责不同，不应合并成一个巨型 token。

## Native bridge 仓库检查

本轮继续搜索：
- `TVBoxAndroidBridge`
- `onPlayerEvent`
- `loadMedia`
- `releaseMedia`
- `MainActivity`
- `android/`
- `capacitor.config`

当前 GitHub 代码搜索仍未发现 Android bridge 实现。

因此当前结论继续保持：

- Native bridge implementation：**仓库内 UNKNOWN / 很可能为外部 WebView/宿主依赖**
- Event payload identity：**UNKNOWN**
- 不修改 Native bridge 协议，不凭空加入 task/session/player 字段。

## 验证状态

- [x] HTML5 HLS stale callback 代码级隔离已提交。
- [x] Native bridge 关键符号继续搜索，无仓库内实现证据。
- [ ] `npm run test:playback-lifecycle`：仍未实际执行；当前环境没有可确认的完整依赖安装结果。
- [ ] `npm test`：未执行。
- [ ] 真实浏览器 HLS rapid switch：PENDING。
- [ ] Android Native rapid switch / release：PENDING。
- [ ] HLS destroy/rebind 的真实浏览器行为：PENDING。

## 当前 P0

### P0-B
- [x] ResourceManager → TaskRegistry stopped-owner 代码/行为测试路径已补齐。
- [ ] 真实 Node 22 执行行为测试。
- [ ] Native releaseMedia 真实释放验证。

### P0-C
- [ ] Native bridge event identity UNKNOWN。
- [ ] 需要宿主 Android/WebView bridge 源码或真实 payload 才能进一步收敛。

### P0-D
- [x] HTML5 HLS adapter-local stale callback guard 已加入。
- [ ] 真实 HLS rapid switch / destroy-rebind 验证。

## P1（暂不进入）
- HTML5 custom headers / candidate capability filtering
- HLS live latency/buffer 策略
- PlaybackPage / LiveFeature 双入口资源边界
- live channel / stream / candidate identity
- EPG stale request isolation

## 下一位 AI 立即执行

1. 先确认当前 HEAD 是否仍为 `2fb1f95af518d53a83679bd450261207289fcbf7`，避免覆盖后续 AI 的提交。
2. 优先解决“真实测试执行”问题：检查仓库是否有 lockfile/CI dependency cache；若当前工具环境不能安装依赖，就明确记录环境阻塞，不伪造 PASS。
3. 检查 `.github/workflows` 是否存在可运行的测试 workflow；如果没有，不要为了测试临时大改 CI。
4. 继续从 `src/player/html5PlayerAdapter.js` 检查非 HLS video DOM event 在 `load → stop → load` 之间是否可能污染新 input；如发现同等级 stale 风险，再补 adapter-local generation，但避免重复 token。
5. Native bridge 仍以 UNKNOWN 处理；若仓库没有 Android 原生代码，转向 adapter-side isolation，而不是猜 bridge 协议。
6. P0 真实验证完成前，不进入 UI polish、路由重构或 HLS 参数 tuning。

## 给下下一位 AI 留的资料

- 本轮已经修的是 **HLS 实例内部 stale callback**，不是 playbackCore generation guard。
- 不要删除 `hlsGeneration`，除非有等价或更强的 HLS instance identity 隔离。
- Native bridge 没有在仓库中找到实现；不要假设 `onPlayerEvent` payload 有 session/player identity。
- 当前 P0 的最后核心障碍已经越来越偏向“真实运行环境/宿主验证”，而不是继续堆静态 token。


# 29. 本轮继续执行结果：P0 真实测试执行链与非 HLS DOM 事件审查

## 本轮
- 日期：2026-10-05
- 起始有效 HEAD：`37d6eba1fed266b5c32340bd81a9dd39121d0fe4`
- 本轮 CI 提交：`1af8425da8b36f72ddc11c9894a0386085479318`
- 工作范围：按 P0 优先级解决“行为测试没有持续执行入口”的工程问题，并继续检查 HTML5 adapter 的非 HLS video DOM event 是否存在第二层 stale callback 风险。

## HEAD / 仓库状态
- 当前 `main` 在本轮开始时确认为 `37d6eba1fed266b5c32340bd81a9dd39121d0fe4`。
- 该 HEAD 与上一轮交接记录一致，未发现后续 AI 提交被覆盖。
- 现有 `.github/workflows/build-apk.yml` 只负责 Android APK 构建。
- 现有 `.github/workflows/deploy.yml` 只负责 GitHub Pages 构建/部署。
- 原先没有专门执行 `test:playback-lifecycle` 的 workflow。
- 仓库仍没有发现 lockfile，因此 CI 继续使用 `npm install`，不能改写成 `npm ci`。

## 本轮实现

### P0-B-2：建立可持续执行的 Playback Lifecycle CI

新增：
- `.github/workflows/test-playback.yml`

触发：
- push main
- pull request main
- workflow_dispatch

执行：
1. Node 22
2. `npm install --no-audit --no-fund`
3. `npm run test:playback-lifecycle`
4. `npm run test:architecture`

目的：
- 不再让行为测试只存在于仓库里却长期没有执行证据；
- 后续任何 AI 修改 playback lifecycle 后，都可以通过 GitHub Actions 获得真实 Node 22 环境验证；
- 同时保留 architecture boundary regression。

注意：
- 本轮不能把 workflow 的“将来执行”写成“已经 PASS”。
- 本轮没有权限/工具调用去伪造 CI 结果，也没有把静态检查当作行为测试结果。

## 非 HLS HTML5 DOM event 审查结论

文件：
- `src/player/html5PlayerAdapter.js`

确认 adapter 在创建时一次性绑定：
- `loadstart`
- `waiting`
- `canplay`
- `playing`
- `pause`
- `timeupdate`
- `durationchange`
- `loadedmetadata`
- `ended`
- `error`

这些 listener 会在 adapter `release()` 时统一解绑，因此：
- candidate switch 通过 playbackCore `attachPlayer()` 创建新 adapter 时，旧 adapter listener 会被 release；
- `stop()` 后的同 controller restart 会重新 attachPlayer，因此旧 adapter listener 也会被 release；
- 这一点没有发现与上一轮 HLS callback 同等级、已被证明的旧 adapter listener 泄漏。

但仍存在一个 **PENDING** 风险：
- 同一个 HTML5 adapter 内部可以多次执行 `load()`；
- `load()` 会先 cleanup HLS / 清空 video src / 再加载新 input；
- 原生 video DOM 事件本身没有携带 playback input identity；
- 因此极端情况下，旧 media load 产生的 DOM event 与新 input 的事件在同一个 video element 上交错时，目前没有 adapter-local input generation 可以直接区分。

当前不能仅凭静态代码断言这是线上 bug，因为：
- 浏览器在 `src` 替换、`load()` 后旧媒体事件的具体交付顺序需要真实浏览器验证；
- 当前没有浏览器自动化测试环境；
- playbackCore 的 playerGeneration 只能隔离“旧 adapter”，不能区分“同一个 adapter 的两次 load”。

因此本轮 **不新增第二套 generation token**，避免在没有复现证据时继续堆防御代码。

## 验证状态

- [x] 当前 main HEAD 已重新确认。
- [x] 已确认 build/deploy workflow 不执行 playback behavior tests。
- [x] 已新增专门的 playback lifecycle CI workflow。
- [x] 已完成非 HLS DOM listener 生命周期静态审查。
- [ ] `npm run test:playback-lifecycle` 本轮仍未在当前工具环境本地执行。
- [ ] 新 workflow 的真实 GitHub Actions run：等待本次提交后的 workflow 运行结果。
- [ ] `npm run test:architecture`：等待 CI。
- [ ] 真实浏览器 HLS rapid switch：PENDING。
- [ ] 同 adapter 多次 load 的 DOM event 交错行为：PENDING。
- [ ] Android Native rapid switch / release：PENDING。

## 当前 P0

### P0-B
- [x] ResourceManager → TaskRegistry stopped-owner 代码/行为测试。
- [x] Playback lifecycle CI execution path。
- [ ] GitHub Actions 首次真实执行结果。
- [ ] Native `releaseMedia` 真实宿主验证。

### P0-C
- [ ] Native bridge event identity：UNKNOWN。
- [ ] Native bridge implementation：仓库内仍未发现。
- [ ] 需要外部宿主源码或真实 event payload。

### P0-D
- [x] HLS instance-local `hlsGeneration`。
- [x] HTML5 adapter release 时解绑 DOM listeners。
- [ ] 同 adapter 多次 `load()` 的 DOM stale event：PENDING。
- [ ] 真实浏览器 HLS destroy/rebind。

## P1（继续暂缓）
- HTML5 custom headers / candidate capability filtering
- HLS live latency/buffer 策略
- PlaybackPage / LiveFeature 双入口资源边界
- live channel / stream / candidate identity
- EPG stale request isolation

## 下一位 AI 立即执行

1. 先确认 `main` 是否已经进入新的 HEAD（本轮最后提交应包含 `test-playback.yml` 与本 handoff 更新）。
2. 检查 GitHub Actions 中 `Playback lifecycle tests` 的第一次运行；如果失败，先修真实失败，不要继续堆 generation guard。
3. 如果 workflow 通过，下一步在真实浏览器环境复现“同一 HTML5 adapter 连续 load 两个 source 时旧 DOM event 是否会污染新 input”。
4. 如果浏览器可复现，再在 `src/player/html5PlayerAdapter.js` 增加**单一 input-load generation**；不要重复增加 HLS generation。
5. 如果浏览器不能复现，保持当前 PENDING，不为理论风险修改代码。
6. Native bridge 继续保持 UNKNOWN；不要猜 payload identity。
7. P0 真实验证完成前，继续不要进入 UI polish / 路由重构 / HLS 参数 tuning。

## 给下下一位 AI 留的资料

- 新增 CI 的目的不是“证明本轮测试通过”，而是把此前缺失的真实 Node 22 行为测试执行链补上。
- 没有 lockfile，因此当前 CI 必须使用 `npm install`。
- `build-apk.yml` 和 `deploy.yml` 都不是 playback regression test workflow。
- HTML5 DOM listener 在 adapter release 时有明确 unbind；不要把“listener 一直挂着”误判为当前 bug。
- 真正剩余的 HTML5 风险是“同一个 adapter 的连续 load 是否存在旧 DOM event 与新 input 交错”，需要浏览器证据后再决定是否增加 input generation。
- 不要删除上一轮的 `hlsGeneration`。


# 30. 本轮继续执行结果：补齐 stop 后 Native stale callback 行为证明

## 本轮
- 日期：2026-10-05
- 起始 HEAD：`3182a4ce4303c819b1a831db19d4c46b941a10b8`
- 代码提交：`c60e4b0799fb8539dc6b52086caccdbc8672d9a9`
- 工作范围：继续 P0 播放生命周期；在 CI 真实结果暂时无法从当前 GitHub connector 读取的情况下，不凭空宣称 PASS，先补一个明确覆盖 stop 生命周期边界的 Native stale-event 行为测试。

## 本轮确认

### CI 状态
- 已确认 `main` 起始 HEAD 为 `3182a4c...`。
- `.github/workflows/test-playback.yml` 已存在，目标为 Node 22 + `npm install` + `test:playback-lifecycle` + `test:architecture`。
- 当前 connector 能读取 workflow 文件，但不能通过现有 workflow-run 接口取得该 push workflow 的 run 列表；commit combined status 目前为空。
- 因此：
  - **不能写 PASS**；
  - **不能写 FAIL**；
  - 当前状态保持 **PENDING / 未观测到 run 结果**。
- 不应因为“没有 status”推断 workflow 没运行。

### P0-B/P0-D：新增 stop 后 stale Native callback 测试
新增：`tests/playback/playback-lifecycle.test.mjs`

场景：
1. 创建 live core；
2. attach + start；
3. 捕获旧 Native `TVBoxWebView.onPlayerEvent` callback；
4. 调用 `core.stop()`；
5. 手动触发旧 callback，模拟 Native bridge 晚到的 error；
6. 断言 UI/player error hook 没有被重新唤起；
7. 断言没有因为 stale error 重新发起 load；
8. 最终 release。

这直接验证了当前设计中：
`stop()` 会让 `activePlayerOperationGeneration = null`，从而旧 adapter/native callback 不能 resurrect recovery。

## 代码结论
当前 Native stale-event 隔离至少覆盖：
- candidate switch：旧 adapter callback generation 不匹配；
- stop：active player operation generation 被清空；
- release：player/operation generation 失效；
- 新 adapter：重新绑定新的 callback。

但仍不能证明 Android bridge 自身不会把旧播放器事件转发给新 adapter；因为仓库内仍没有发现 bridge 实现或 payload identity。

## 验证状态
- [x] 新增 stop 后 Native stale callback 行为测试。
- [x] 代码级确认 `main` 起始 HEAD。
- [x] 确认 workflow 文件存在。
- [ ] `npm run test:playback-lifecycle`：当前工具环境未本地执行。
- [ ] `npm run test:architecture`：当前工具环境未本地执行。
- [ ] GitHub Actions 真实 run：当前 connector 无法取得 push run 列表，保持 PENDING。
- [ ] 浏览器真实 HLS rapid switch：PENDING。
- [ ] 同 adapter 多次 `load()` DOM event 交错：PENDING。
- [ ] Android Native 真机 rapid switch/release：PENDING。
- [ ] Native bridge event identity：UNKNOWN。

## 当前 P0
### P0-B
- [x] ResourceManager → TaskRegistry stopped-owner 行为测试。
- [x] stop/restart 行为测试。
- [x] stop 后 stale Native callback 行为测试。
- [ ] Node 22 实际执行结果。
- [ ] GitHub Actions 实际执行结果。
- [ ] Native `releaseMedia` 真机释放证明。

### P0-C / P0-D
- [x] playbackCore operation/player/active-operation generation guards。
- [x] HTML5 HLS `hlsGeneration`。
- [x] HTML5 adapter release 时 DOM listener unbind。
- [x] Native stale callback 在 stop/candidate switch 的 core-side isolation tests。
- [ ] Native bridge payload identity / external host implementation。
- [ ] 同 adapter 多次 `load()` 的真实浏览器事件顺序。
- [ ] HLS destroy/rebind 真实浏览器验证。

## 下一位 AI 立即执行
1. `main`：确认 HEAD 已进入 `c60e4b0799fb8539dc6b52086caccdbc8672d9a9`，不要覆盖本轮提交。
2. GitHub Actions：继续尝试通过可用的 GitHub Actions run/job 接口获取 `Playback lifecycle tests` 的真实结果；若能拿到失败 job，直接按日志修真实失败。
3. `tests/playback/playback-lifecycle.test.mjs`：在真实 Node 22 环境执行 `npm run test:playback-lifecycle`，再执行 `npm run test:architecture`；记录真实结果。
4. `src/player/html5PlayerAdapter.js`：如果有浏览器自动化能力，验证同一 adapter 连续 `load(A) → load(B)` 时旧 DOM event 是否能污染 B；只有复现才增加单一 input-load generation。
5. `src/player/nativePlayerAdapter.js`：继续确认外部 Android/WebView bridge 来源；不要猜 payload identity，也不要修改 bridge 协议。
6. P0 真实验证未完成前，继续不要进入 UI polish、路由大重构、HLS 参数 tuning。

## 给下下一位 AI 留的资料
- 本轮不是重新增加 generation；只是把已有 stop 隔离设计补成一个明确的行为测试。
- 不要把 GitHub connector “读不到 workflow run”解释成 workflow 没运行。
- 当前没有锁文件，CI 继续使用 `npm install`。
- 不要删除 `hlsGeneration`。
- 不要把 Native bridge payload identity 当成已知事实；当前仍 UNKNOWN。
- 真正下一步优先级仍是“取得真实测试执行证据”，其次才是浏览器/真机验证。


---

# 23. 2026-10-05 本轮执行记录：P0-2 第一处实际修复

## 本轮结论

重新审核本接力方案后，确认原方案仍然值得继续，但不能继续停留在“泛审查”。当前代码已经有一部分 P0 生命周期防护，尤其是：

- `playbackCore` 已存在 `operationGeneration`；
- player callback 已存在 `playerGeneration`；
- `resolveAndLoad` 会在异步完成后再次校验 generation；
- `playbackResourceManager` + `playbackTaskRegistry` 已形成单资源 owner 链；
- 已存在 `tests/playback/playback-lifecycle.test.mjs`，覆盖快速切候选、stop/release、竞争 owner、旧 native callback 等场景。

因此下一阶段不能重复“重新设计 generation”，而应继续找真实业务层竞态。

## 本轮实际修改

### 文件

`src/features/live/LiveFeature.jsx`

### 修复

修复直播频道切换时的 **lazy stream 请求残留**：

原问题：

1. A 频道是 `deferredRef`，开始异步读取线路；
2. 用户在请求完成前切到 B；
3. 原来的 `selectChannel(B)` 对非 deferred B 不会取消 A 的请求；
4. A 的请求仍继续运行；
5. 如果 B 是普通已知线路，`streamLoading` 可能因为 A 的 finally 不执行状态更新而继续保持 `true`；
6. 用户已经在 B，却可能看到错误的“正在读取地址”状态；
7. 同时浪费 A 的网络请求，并把异步生命周期继续留在旧频道。

本轮改为：

- 每次 `selectChannel` 先 abort 当前旧的 `streamAbortRef`；
- 清空 `streamAbortRef`；
- 立即 `setStreamLoading(false)`；
- 再设置新的 selected channel；
- 只有 deferred 且尚无缓存时才重新启动 lazy stream 请求。

### 当前 commit

`f11c9a7fd9e7d23090298795ccef3709b33732b4`

### 状态

- [x] 代码修改完成
- [x] 修改范围仅限直播频道 lazy stream 生命周期
- [x] 没有修改 playbackCore generation 机制
- [x] 没有删除 globalLiveCache
- [x] 没有修改 HLS buffer
- [x] 没有修改 Native bridge
- [ ] 浏览器真实验证
- [ ] Android 真实验证
- [ ] 多频道快速点击真实验证
- [ ] HLS 实源验证

## 为什么现在先做这个

这是一个已经能从代码直接证明的业务层竞态，不需要猜真实 CDN 行为，也不需要大重构。

优先级高于 UI 美化，因为它直接影响：

- 频道切换正确性；
- loading 状态正确性；
- 请求取消；
- 用户快速选台；
- 直播页的状态单一事实源。

---

# 24. 重新审核后的剩余工作排序

## P0-1：播放生命周期

当前部分已经有 generation guard，下一位 AI 不要重复实现。

继续检查：

1. `src/playback/playbackCore.js`
2. `src/playback/playbackResourceManager.js`
3. `src/playback/playbackTaskRegistry.js`
4. `src/services/playbackService.js`
5. `src/features/live/LiveFeature.jsx`
6. `src/pages/PlaybackPage.jsx`

目标：

- 证明 controller 创建/销毁唯一；
- 证明 channel switch 不会产生两个 live owner；
- 证明 leave 后 release 一定到 adapter；
- 证明 old resolve / old player event 不会污染新 controller。

## P0-2：LiveFeature 业务层异步竞态

本轮已修复：

- [x] deferred A → 普通 B 时取消 A request
- [x] 避免旧 request 把 loading 状态长期留在 B

还未完成：

- [ ] deferred A → deferred B → deferred C 快速切换的真实行为
- [ ] A 的 streams resolve 完成后不能改变 B/C 的 selected/playback state
- [ ] `resolvedStreams` 是否应该按 sourceId + channelId，而不仅仅 channelId 缓存
- [ ] source 删除/禁用后旧缓存是否必须立即失效
- [ ] 多个 TV1 source 返回相同 channelId 时是否会发生覆盖

重点文件：

- `src/features/live/LiveFeature.jsx`
- `src/services/requestManager.js`
- `src/services/tv1LiveService.js`
- `src/services/liveService.js`
- `src/models/live.js`

## P0-3：Native bridge 旧事件隔离

当前代码已经能阻止“旧 adapter callback 本身”直接触发 core recovery，但仍存在更深层风险：

`window.TVBoxWebView.onPlayerEvent` 是全局单 callback。

Android 侧 `NativePlaybackBridge` 本身也是单 playback owner。

因此必须继续确认：

- 新 adapter 创建前旧 native player 是否已经 release；
- Android late callback 是否可能在新 adapter 已安装后抵达；
- event payload 当前没有明确看到 session/generation id；
- 如果 Android 不能区分事件来源，仅靠 JS callback 引用无法区分“旧播放器事件”和“新播放器事件”。

重点文件：

- `src/player/nativePlayerAdapter.js`
- `android/app/src/main/java/com/yuivo9999/mybox123/NativePlaybackBridge.java`
- `android/app/src/main/java/com/yuivo9999/mybox123/MainActivity.java`

**不要直接加入 session id 却不修改 Android 侧。必须先确认 bridge event payload 合约。**

## P0-4：HTML5/HLS live latency

当前明确存在：

- `lowLatencyMode: false`
- live 初始 `maxBufferLength: 20`
- 首个 fragment 后动态提升到 `60`
- `maxMaxBufferLength: 120`
- `liveSyncDurationCount: 6`
- `liveMaxLatencyDurationCount: 30`

这仍是 PENDING，不得写成 FAIL。

下一步需要：

- 实源测试；
- 看 target duration；
- 观察起播 latency；
- 观察持续观看后 live edge latency；
- 观察网络抖动时 buffer 与追赶行为。

文件：

- `src/player/html5PlayerAdapter.js`

## P0-5：Controller / page ownership

重点确认：

- `LiveFeature` 内嵌播放器；
- `PlaybackPage` 沉浸播放器；
- `App.jsx` 路由切换；
- `playbackResourceManager` 单 owner。

目标不是砍掉一个页面，而是证明：

> 任意时刻只有预期的播放 owner。

文件：

- `src/features/live/LiveFeature.jsx`
- `src/pages/PlaybackPage.jsx`
- `src/app/App.jsx`
- `src/state/sessionStateStore.js`

---

# 25. 已经排除/不要重复做的事情

下一位 AI 不要重新花一轮去证明以下事项，除非代码已变化：

- `playbackCore` 已经存在 operation generation；
- player callback 已经有 player generation；
- `playbackResourceManager` 已经会释放 previous owner；
- `playbackTaskRegistry` 已经有 stopAndRelease；
- 已经有 playback lifecycle 行为测试；
- LiveFeature fallback comment 已明确说明自动 fallback 由 playbackCore/task owner；
- HLS cleanup 已有 generation + destroy；
- HTML5 adapter 已有 event listener unbind；
- Native adapter release 时不会无条件删除别人的 global callback。

这些是“已有事实”，不是“已经全部正确”。

---

# 26. 当前测试真实状态

`package.json` 中：

- `test:playback-lifecycle` → `node --test tests/playback/playback-lifecycle.test.mjs`
- 大量其他 `test:*` 仍然指向同一个 `tests/architecture/test-runner.mjs`

因此：

> 不能因为脚本名字很多，就认为已经有大量独立行为测试。

当前 lifecycle test 已覆盖：

- resource owner replacement；
- stale candidate load；
- A → B → C 快速切换；
- stop invalidates pending load；
- stop 后 restart；
- competing controller；
- release while loading；
- native callback after stop；
- old native callback after candidate switch。

下一位 AI 应继续补：

- LiveFeature channel switch；
- deferred request abort；
- page unmount；
- route switch；
- EPG request race；
- source disable/remove race。

---

# 27. 下一位 AI 立即执行（严格顺序）

1. **先读本文件，然后检查 main HEAD。**
2. 打开 `src/features/live/LiveFeature.jsx`，确认本轮 lazy-stream abort 修改仍存在。
3. 检查 `selectChannel → loadChannelStreams → resolveLiveChannelStreams → requestManager`，证明 A→B→C 的异步结果不会污染状态。
4. 检查 `src/player/nativePlayerAdapter.js` + `NativePlaybackBridge.java` 的 callback/event 合约，确认是否能安全增加 session/generation。
5. 检查 `src/pages/PlaybackPage.jsx` 与 `LiveFeature.jsx` 的 controller 生命周期是否完全对称。
6. 检查 `html5PlayerAdapter.js` 的 live latency 策略，但在没有实源证据前保持 PENDING。
7. 新增/补行为测试；不要为了测试而修改生产逻辑。
8. 完成后更新本文件，再交接给下一位 AI。

---

# 28. 给下下一位 AI 的接力资料

如果本轮没有完成 P0-3 Native event isolation：

### 已知道

- JS Native adapter 使用 `window.TVBoxWebView.onPlayerEvent`；
- Android 真正播放器入口是 `NativePlaybackBridge`；
- `MainActivity` 创建单个 `NativePlaybackBridge`；
- Android bridge 当前 payload 中可见字段主要是 url、headers、cookies、playerHint 等；
- 当前没有在已读取代码中确认 event payload 带 sessionId；
- JS core 已有 generation guard，但这个 guard 只知道“当前 JS adapter generation”，不能凭空知道 Android event 来自哪个 native engine instance。

### 尚未知道

- Android 的 `emit()` 完整实现是否能安全携带 playback generation；
- Android engine fallback 时 event 是否来自同一 logical session；
- releaseMedia 与下一次 loadMedia 在 Android bridge 中的实际调用时序；
- 是否存在异步旧 engine callback 穿透到新 logical playback 的真实路径。

### 下一步应该搜索

- `NativePlaybackBridge.java` 中所有 `emit(` 调用；
- `emit(String event` 的完整实现；
- `fallbackOrError`；
- `releaseCurrentEngine`；
- Exo/IJK/MediaPlayer listener；
- JS `nativePlayerAdapter.js` 的 event payload normalization。

### 不要重复做

不要再重做 JS generation guard，除非后续发现它有 bug。

---

# 29. 本轮交接原则

本轮只做了一个明确、可证明的生产修复，没有顺手做 UI 大改或播放架构重构。

下一位 AI 必须继续遵守：

> **先证明竞态，再改代码；先完成一个闭环，再更新 handoff；任何未知都保留 UNKNOWN/PENDING。**

每一位 AI 都必须继续把未完成资料留在本文件，使下下一位 AI 能从具体文件、具体函数、具体验证目标继续，而不是重新审查整个仓库。


# 2026-10-05 本轮执行记录：P0 Native engine stale callback 隔离

## 本轮审核结论

重新审核现有方案后，确认大方向仍然正确，但可以继续做，而且下一步不应再重复 JS generation guard。当前最值得立即处理的是 Android Native bridge 自身的异步 engine callback 隔离。

### 仍值得做，按优先级
1. **P0：Native engine callback generation 隔离** — 已本轮完成。
2. **P0：LiveFeature A→B→C deferred stream 竞态行为测试** — 下一步。
3. **P0：EPG 请求竞态 / source disable-remove 竞态** — 下一步。
4. **P0：LiveFeature 与 PlaybackPage 播放 owner 边界证明** — 先测试再决定是否收敛，不直接删入口。
5. **P1：HTML5 custom headers capability filtering** — 明确 Web 与 Native 能力差异。
6. **P1：HLS live latency/buffer 实源验证** — 没有真实流证据前保持 PENDING，不调参。
7. **P1：channel/source/stream/candidate identity 与历史/收藏闭环**。
8. **P2：URL/deep-link 与 UI/UX 收敛** — P0/P1 播放稳定后再做。

## 本轮实际修改

文件：`android/app/src/main/java/com/yuivo9999/mybox123/NativePlaybackBridge.java`

提交：`bb8ad63bd49e35c4d1510a4eafb5e0950f6d4dcf`

### 已确认的真实问题
JS 层虽然已有 `operationGeneration/playerGeneration`，但 Android bridge 内部仍存在一个更深层的竞态：

- bridge 是长期存在的单实例；
- `loadMedia()` 会 release 当前 Exo/IJK/Native engine，再创建新 engine；
- 各 engine 的 listener 是异步回调；
- `emit()` 原先没有 engine identity；
- 旧 engine 在 release 后如果仍回调，可能通过 bridge 当前的全局 `window.TVBoxWebView.onPlayerEvent` 把旧事件送给新 JS adapter。

这不是理论上的“多个 JS adapter 覆盖 callback”问题，而是 **同一个 Android bridge 内 engine replacement 的事件身份缺失**。

### 本轮修复
增加 bridge 内部单调递增的：

`playbackGeneration`

并让每次 engine 创建时捕获：

`final long engineGeneration = playbackGeneration`

以下异步 engine callback 均带 generation：

- ExoPlayer：buffering / prepared / playing / paused / completed / error
- IJK：prepared / decoderChanged / completed / buffering / error
- Android MediaPlayer：prepared / completed / buffering / error

同时：

- `loadMedia()` 创建新 logical playback 前递增 generation；
- engine fallback 替换 engine 前递增 generation；
- `releaseMedia()` 递增 generation；
- `emit(event,data,generation)` 在转发前检查 generation 与当前值是否一致；
- stale generation 直接丢弃；
- `fallbackOrError(reason,generation)` 同样拒绝 stale callback 触发 fallback。

### 设计理由
目标不是增加更多 JS 防御，而是把事件身份隔离下沉到真正产生异步事件的边界：

`Android engine callback → NativePlaybackBridge generation gate → JS adapter generation gate → playbackCore operation gate`

这样形成两层不同责任的防线：

- Android bridge：防旧 engine 事件污染当前 engine；
- JS playbackCore：防旧 controller/operation 污染当前页面 session。

## 当前状态

- [x] 已确认 Android bridge 实现与 JS adapter 的真实事件合约。
- [x] 已发现 bridge 没有 engine/session identity。
- [x] 已在 Native bridge 增加 engine generation guard。
- [x] 已让 fallback callback 同样受 generation guard 保护。
- [ ] Android Gradle 真机/模拟器编译验证。
- [ ] Android 真机 rapid switch/release 验证。
- [ ] GitHub Actions Android workflow 真实结果。

## 当前仍不能确定

### PENDING：Android engine callback 的实际晚到路径
代码现在已经对 stale callback 做了拒绝，但还没有真实设备证明：

- Exo release 后是否一定还会回调；
- IJK release 后是否可能继续回调；
- fallback/reload 的具体线程交错时序。

因此本轮可以确认 **防御已存在**，但不能宣称“真机已验证”。

### PENDING：LiveFeature deferred A→B→C
当前已有生产修复：

- selectChannel 会 abort 前一个 deferred stream request；
- streamLoading 会立即归零；
- 新频道重新决定是否需要 lazy load。

但还缺少行为测试证明 A/B/C 的 promise completion 顺序不会污染 `resolvedStreams` / `selectedChannelId` / playback state。

## 下一位 AI 立即执行

1. **先确认 HEAD 已进入 `bb8ad63bd49e35c4d1510a4eafb5e0950f6d4dcf`。**
2. 给 `LiveFeature` 增加 deferred A→B→C 行为测试；重点断言旧请求即使晚完成也不能改变当前频道状态。
3. 检查 `resolvedStreams` 的 cache key：当前只按 `channelId`，需要确认多 source 同 channelId 时是否会串缓存；如果会，修为 source-aware identity。
4. 检查 EPG：`LiveFeature` 当前 channel change 后异步 `getEPG(activeChannel)` 只用 local active flag；继续确认 rapid A→B→C 与 source disable/remove 时不会污染。
5. 检查 `PlaybackPage` 与 `LiveFeature` 的 controller 生命周期是否可能在 route transition 短时间重叠；用行为测试证明 resource owner，而不是先删页面。
6. P0 真实验证未完成前，不修改 HLS buffer 参数，不做 UI 大改，不做 React Router 大迁移。

## 给下下一位 AI 的资料

- 不要重新实现 JS `operationGeneration/playerGeneration`，已有并已有行为测试。
- 不要删除 `globalLiveCache`；它仍需要在业务层竞态完成后再判断是否收敛。
- Native bridge generation 现在已经存在，后续重点是验证，不是继续堆第二个 generation。
- Android bridge 的 generation 是 logical playback/engine replacement 级别；JS core generation 仍是 controller operation 级别，两者职责不同。


# 2026-10-05 本轮执行记录：P0-2 deferred stream cache source identity

## 本轮实际发现

确认 LiveFeature 的 resolvedStreams 原先只用 channelId 作为缓存键。

这里存在一个真实的业务层风险：normalizeLiveChannel 会把相同 canonical channel 合并成一个频道，同时保留多个 sourceRefs。如果某个来源被禁用，而另一个来源仍提供同一频道，旧 deferred stream 缓存可能仍以同一个 channelId 命中，从而继续使用已经失效来源的播放地址。

因此这不是简单的“缓存重复”问题，而是 merged channel + source enable/disable + deferred stream cache 的身份问题。

## 本轮实际修改

### 新增

- src/features/live/liveStreamCache.js
  - 提供纯函数 getLiveStreamCacheKey(channel, sources)
  - cache identity 现在由当前可用 sourceId + channelId 组成
  - 使用内部 NUL 分隔符避免普通冒号拼接产生歧义。

### 修改

- src/features/live/LiveFeature.jsx
  - deferred stream cache 改为 source-aware；
  - active channel 读取 cache 时使用同一 identity；
  - lazy load 写入 cache 时使用同一 identity；
  - source 被禁用后，会清理对应 source 的 resolved stream cache；
  - UI 的线路数量显示也使用 source-aware cache。

### 测试

新增：

- tests/live/live-stream-cache.test.mjs

覆盖：

1. 同一个 merged channel 在 source A / source B 之间不会共享同一个 deferred cache key；
2. source A 禁用、source B 启用时，会选择 source B 的 cache identity。

## Commit

- a938f25bc4cb614af85539a30aa8233c8f5e5ee0 — source-aware deferred stream cache
- 927099bddf2154d2981a8722370d8cd1e8c88ae5 — extract pure cache identity helper
- d78cdd0632365e029f0bedffa3274234521e0e61 — wire helper into LiveFeature
- c4a313299e02fbc5f84f3dee8a2679ce21119d0a — add pure helper tests

## 当前状态

- [x] deferred cache identity source-aware
- [x] disabled source cache invalidation
- [x] helper extracted to pure JS module
- [x] behavior-level helper tests added
- [ ] Node 22 实际执行测试
- [ ] React 浏览器快速 A→B→C 验证
- [ ] source A disable → source B fallback 的真实页面验证

## 下一步严格顺序

1. 先执行 node --test tests/live/live-stream-cache.test.mjs，确认 helper 测试真实通过。
2. 再检查 LiveFeature 的 deferred A→B→C 请求取消是否还存在第二个状态污染点。
3. 重点审查 EPG A→B→C：当前只有 local active flag，没有 request cancellation；确认旧请求虽然不会 setState，但是否仍浪费网络/占用 requestManager。
4. 检查 source disable/remove 时 TV1 metadata session 是否继续保留旧频道，导致重新启用/切源后的数据身份问题。
5. 完成后再进入 PlaybackPage / LiveFeature owner overlap。
6. HLS 参数、UI polish、路由大改继续保持冻结。

## 不要重复做

- 不要重新实现 JS playback generation；
- 不要重新实现 Native bridge generation；
- 不要删除 globalLiveCache；
- 不要修改 HLS buffer 参数；
- 不要因为 cache identity 已修复就认为 A→B→C 整体竞态已经验证完成。

# 2026-10-05 本轮执行记录：P0 EPG stale request cancellation

## 本轮实际发现

确认 LiveFeature 与 LiveChannelPanel 的 EPG 请求此前只有 React 层面的 `active` 标记：

- 频道 A 发起 `getEPG(A)`；
- 快速切到 B/C 后，旧 promise 仍继续执行；
- 旧结果虽然不能再 setState，但请求本身仍可能继续占用网络/adapter/requestManager；
- `liveService.getEPG` 已经把 requestManager 的内部 signal 传给 adapter，但上层没有办法把频道 effect 的 AbortController 传到底层。

因此问题不是“旧 EPG 会直接污染 React state”——local active flag 已阻止这一点——而是**取消链没有贯通**。

## 本轮实际修改

### 1. `src/features/live/LiveFeature.jsx`

频道当前节目 effect 改为：
- 每个 activeChannel 创建独立 `AbortController`；
- 调用 `liveService.getEPG(activeChannel, {}, { signal })`；
- cleanup 时 `controller.abort()`；
- AbortError 不作为页面错误显示；
- 非 aborted 的请求才允许更新 currentEPG。

`LiveChannelPanel` 的 EPG effect 同样改为 AbortController，避免详情页 A → B 切换时旧节目单请求继续占用资源。

同时 `createLiveFeature().getEPG()` 增加 options 透传。

### 2. `src/services/liveService.js`

`getEPG(channelRef, range, options)` 增加可选 signal：
- 保留 requestManager 自身 signal；
- 如果调用方提供 `options.signal`，优先把它传给 adapter；
- 因此 TVBox/HTTP 等真正支持 AbortSignal 的 adapter 可以在页面切换时立即结束旧请求；
- 没有网络请求的本地 EPG adapter 不受影响。

## Commit

- `e966c3b4b5fa57b18f9c88b0bdcd7ace5df828b2` — `fix(live): propagate EPG cancellation signal`
- `279cfa942b986e35d5e8e15095107dcf53117ca6` — `fix(live): cancel stale EPG requests on channel change`

当前 `main` HEAD：`279cfa942b986e35d5e8e15095117ca6`

## 已验证

- [x] 代码静态检查：`LiveFeature` 两处 EPG effect 都创建/cleanup AbortController。
- [x] `createLiveFeature.getEPG` 已透传 options。
- [x] `liveService.getEPG` 已将上层 signal 传入 adapter。
- [x] 当前 commit 的 GitHub combined status 返回无已配置 status checks。
- [ ] Node 行为测试实际执行
- [ ] 浏览器 A → B → C 真实切台
- [ ] 真实 TVBox/HTTP EPG AbortSignal 行为
- [ ] Android 真实验证

## 当前判断

P0 EPG 竞态从“只防 state 污染”提升为“state 防污染 + 请求取消链”。

但仍有一个边界没有在本轮扩大：

`requestManager.run()` 自身的内部 controller 与调用方 AbortController 不是同一个对象。

当前实现通过把调用方 signal 传给 adapter 达到实际 I/O 取消；如果未来某个 adapter 不消费 signal，requestManager entry 仍会持续到 adapter promise 自己结束。

这应作为后续 requestManager capability/abort-contract 的独立问题，不在本轮混入。

## 下一位 AI 立即执行

1. **P0：检查 `src/services/tv1LiveService.js` 的 `sessions` 生命周期。** 源禁用/删除后是否仍保留旧 sourceId session；重新启用同 sourceId 时是否可能复用过期 metadata。
2. **P0：检查 `LiveFeature` TV1 metadata effect。** 当前仍只有 `active` flag，没有把 AbortController 传给 `tv1LiveService.loadMetadata`；重点验证 source A → disabled/remove → source B 是否继续网络读取和写入全局缓存。
3. **P0：补 `tests/live` 行为测试。** 至少覆盖 EPG cleanup abort、deferred A → B → C、source disable/remove。
4. **P0：再检查 `LiveFeature` ↔ `PlaybackPage` controller/resource owner 边界。**
5. P1 HTML5 custom headers capability filtering。
6. P1 HLS live latency 实源验证继续保持 PENDING。
7. UI/路由继续冻结，除非发现播放闭环必须修复的问题。

## 不要重复做

- 不要重新实现 playbackCore generation；
- 不要重新实现 Native bridge generation；
- 不要删除 globalLiveCache；
- 不要修改 HLS buffer；
- 不要把 `active` flag 说成已经解决了请求取消问题；
- 不要因为 EPG 已有 AbortController 就宣称真实网络 Abort 已通过设备/浏览器验证。