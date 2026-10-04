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

