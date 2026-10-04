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
