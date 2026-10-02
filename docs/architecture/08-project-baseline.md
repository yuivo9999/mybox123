# 08_现有项目结构与实现基线

> Baseline 文档：基于 `yuivo9999/mybox123` 的 `main` 分支当前代码快照建立。  
> 基准提交：`9bed9eaf8627277dbcdb30f46a68e47397ce904f`。  
> 调查原则：只记录当前实际代码；不在本阶段重构业务。  
> 本次 Baseline 建立过程中未读取仓库 `README.md`，未读取任何 ZIP 文件，未执行或推送 GitHub Actions，未进行本地拉取/本地构建。

---

## 1. 项目定位

当前项目是一个 React + Vite 的 TVBox 竖屏应用实现，当前 package 版本为 `0.3.0`。

当前实际入口：

```text
index.html
  ↓
src/main.jsx
  ↓
src/app/App.jsx
  ↓
ErrorBoundary
  ↓
App
```

React 入口使用 `createRoot(document.getElementById('root'))`。

---

## 2. 当前完整代码树

当前 `src` 实际文件登记如下：

```text
src/
├─ adapters/
│  ├─ live/
│  │  ├─ jsonParser.js
│  │  ├─ liveAdapter.js
│  │  ├─ liveCapabilities.js
│  │  ├─ liveIdentity.js
│  │  ├─ liveRegistry.js
│  │  ├─ liveTypes.js
│  │  ├─ m3uParser.js
│  │  ├─ normalizeLive.js
│  │  ├─ rea
│  │  └─ xmlParser.js
│  └─ movie/
│     ├─ jsonParser.js
│     ├─ movieAdapter.js
│     ├─ movieRegistry.js
│     └─ normalizeMovie.js
├─ app/
│  ├─ App.jsx
│  └─ rea
├─ components/
│  ├─ ErrorBoundary.jsx
│  ├─ StateViews.jsx
│  ├─ feedback/
│  │  ├─ EmptyView.jsx
│  │  ├─ ErrorView.jsx
│  │  └─ LoadingView.jsx
│  ├─ layout/SectionTitle.jsx
│  └─ media/
│     ├─ ChannelCard.jsx
│     └─ MovieCard.jsx
├─ config/index.js
├─ data/
│  ├─ demoData.js
│  ├─ index.js
│  ├─ live/liveDataSource.js
│  ├─ movie/movieDataSource.js
│  └─ search/searchDataSource.js
├─ features/
│  ├─ favorite/
│  ├─ history/
│  ├─ live/LiveFeature.jsx
│  ├─ movie/MovieFeature.jsx
│  ├─ search/
│  └─ settings/
├─ main.jsx
├─ mocks/
├─ models/
│  ├─ content.js
│  ├─ errors.js
│  ├─ live.js
│  ├─ parser.js
│  ├─ playback.js
│  └─ userData.js
├─ pages/
│  ├─ MainPage.jsx
│  └─ PlaybackPage.jsx
├─ parsers/
│  ├─ dashParser.js
│  ├─ directParser.js
│  ├─ hlsParser.js
│  ├─ parserChain.js
│  └─ parserService.js
├─ playback/
│  ├─ playbackCore.js
│  ├─ playbackErrorPolicy.js
│  ├─ playbackEventBus.js
│  ├─ playbackEventProtocol.js
│  ├─ playbackLifecyclePolicy.js
│  ├─ playbackNetworkPolicy.js
│  ├─ playbackResourceManager.js
│  ├─ playbackSessionManager.js
│  ├─ playbackStateMachine.js
│  └─ playbackTaskRegistry.js
├─ player/
│  ├─ html5PlayerAdapter.js
│  ├─ nativePlayerAdapter.js
│  └─ playerInterface.js
├─ repositories/
│  ├─ sourceRepository.js
│  └─ userDataRepository.js
├─ runtime/webViewRuntime.js
├─ services/
│  ├─ cacheService.js
│  ├─ contentService.js
│  ├─ errorService.js
│  ├─ liveService.js
│  ├─ movieService.js
│  ├─ movieSourceService.js
│  ├─ playbackService.js
│  ├─ requestManager.js
│  ├─ sourceRegistryService.js
│  ├─ sourceRuntimeService.js
│  └─ userDataService.js
├─ state/
│  ├─ pageStateStore.js
│  ├─ persistentStateStore.js
│  ├─ sessionStateStore.js
│  ├─ usePersistentState.js
│  └─ useSessionState.js
├─ storage/
│  ├─ cache.js
│  ├─ migration.js
│  └─ storage.js
├─ styles/app.css
└─ utils/
   ├─ serialization.js
   └─ validation.js
```

根目录实际还存在：

```text
index.html
package.json
vite.config.js
docs/
tests/
```

---

## 3. React 入口与页面结构

### 3.1 React 入口

```text
src/main.jsx
  ├─ React
  ├─ createRoot
  ├─ styles/app.css
  └─ AppRoot
```

### 3.2 页面/Feature 实际结构

```text
AppRoot
└─ ErrorBoundary
   └─ App
      ├─ FirstLaunch
      ├─ MovieFeature
      ├─ LiveChannelPanel
      ├─ PlaybackPage
      ├─ MainPage
      └─ BottomNav
```

App 当前没有使用传统 React Router；页面状态由：

```text
sessionStateStore
  ├─ tab
  ├─ route
  └─ selected
```

驱动。

实际 route 至少包含：

```text
detail
movie-play
search
live-channel
live-play
```

实际 tab 至少包含：

```text
home
movies
live
favorites
me
history
search-history
sources
settings
data-management
about
```

---

## 4. 页面实际功能基线

### 首页

当前通过 `MainPage` 承担首页/我的等页面状态分支；App 的 BottomNav 提供：

```text
首页
影视
直播
收藏
我的
```

### 影视

当前实际包含：

```text
影视列表
分类/筛选
搜索
搜索历史
详情
集数
播放
收藏
播放历史
```

核心文件：

```text
src/features/movie/MovieFeature.jsx
src/services/movieService.js
src/services/contentService.js
src/services/movieSourceService.js
src/adapters/movie/movieAdapter.js
src/pages/PlaybackPage.jsx
```

### Live

当前实际包含：

```text
Live 分类
频道列表
频道详情
多 Stream
播放
收藏
历史
```

核心文件：

```text
src/features/live/LiveFeature.jsx
src/services/liveService.js
src/adapters/live/liveAdapter.js
src/adapters/live/m3uParser.js
src/adapters/live/jsonParser.js
src/adapters/live/xmlParser.js
```

### 收藏

用户数据模型同时支持：

```text
targetType=content
targetType=channel
```

### 我的

当前实际有：

```text
播放历史
搜索历史
源管理
设置
数据管理
关于
```

设置页面中存在部分展示型设置入口；并非所有设置菜单都已经连接到独立的持久化业务字段。Baseline 将其记录为现状，不在 08 阶段补造行为。

---

## 5. 页面真实依赖登记

### App

```text
App
├─ contentService
├─ playbackService
├─ cacheService
├─ sourceRuntimeService
├─ usePersistentState
├─ useSessionState
├─ sessionStateStore
├─ pageStateStore
├─ MovieFeature
├─ LiveFeature / LiveChannelPanel
├─ webViewRuntime
├─ MainPage
└─ PlaybackPage
```

因此 App 当前是高频入口和高耦合协调点。

### MainPage

MainPage 直接依赖：

```text
LiveFeature
StateViews
浏览器 Blob/FileReader/URL API
```

源导入/导出直接在页面层执行。

### MovieFeature

主要依赖：

```text
movieService
playbackService
persistent state
page state
```

### LiveFeature

主要依赖：

```text
liveService
playbackService
persistent state
```

### PlaybackPage

主要承担：

```text
Playback request
Playback controller
Player UI
episode/channel 切换
播放事件
进度回写
```

---

## 6. 影视实际数据流

当前实际主链：

```text
Source Config
  ↓
sourceRuntimeService
  ↓
movieSourceService / sourceRegistryService
  ↓
movieAdapter
  ↓
requestManager
  ↓
JSON/源格式解析
  ↓
normalizeMovie
  ↓
Content Model
  ↓
contentService
  ↓
App contentState
  ↓
MovieFeature
  ↓
Movie Detail
  ↓
Episode
  ↓
Playback Candidate
  ↓
playbackService
  ↓
PlaybackPage
  ↓
playbackCore
  ↓
parserService
  ↓
Player
```

影视标准数据核心模型位于：

```text
src/models/content.js
```

其中实际存在：

```text
contentId
legacyContentId
contentIdentity
contentMatchKey
sourceRefs
episodes
episodeId
playbackCandidates
```

---

## 7. Live 实际数据流

当前实际主链：

```text
Live Source Config
  ↓
sourceRuntimeService
  ↓
liveService
  ↓
liveRegistry / liveAdapter
  ↓
M3U / JSON / XML Parser
  ↓
normalizeLive
  ↓
LiveChannel
  ↓
category / channels
  ↓
LiveFeature
  ↓
channel selection
  ↓
Stream
  ↓
playbackService.createLiveRequest
  ↓
PlaybackPage
  ↓
playbackCore
  ↓
parser/player
```

Live 解析器：

```text
src/adapters/live/m3uParser.js
src/adapters/live/jsonParser.js
src/adapters/live/xmlParser.js
```

Live 身份体系：

```text
src/adapters/live/liveIdentity.js
src/models/live.js
```

EPG 数据结构/ID 生成位于 `models/live.js`；当前 Baseline 没有把 EPG 误判为独立 UI 页面。

---

## 8. 数据模型登记

### Content

```text
src/models/content.js
```

负责：

```text
ContentType
createContentIdentity
createContentMatchKey
createContentId
createEpisodeId
normalizeEpisode
normalizeContent
```

### Live

```text
src/models/live.js
```

负责：

```text
Channel Identity
Channel ID
Source Channel ID
Stream ID
EPG Program ID
EPG 状态
```

### Playback

```text
src/models/playback.js
```

负责：

```text
PlaybackKind
PlaybackRequestStatus
PlaybackFailureCode
PlaybackCandidate
PlaybackRequest
candidate expiration
protocol inference
```

### Parser

```text
src/models/parser.js
```

负责解析相关模型和 Resolved Media Input。

### User Data

```text
src/models/userData.js
```

负责：

```text
Favorite ID
History ID
Progress ID
Search ID
emptyUserData
```

---

## 9. 用户数据链

真实链路：

```text
React Component
  ↓
persistentStateStore
  ↓
userDataService
  ↓
userDataRepository
  ↓
storage
  ↓
window.localStorage
```

持久数据包括：

```text
favorites
history
progress
searches
settings
selectedSources
sources
migration state
```

进度写入还有保护逻辑：

```text
shouldWriteProgress
  ↓
避免旧位置覆盖新位置
  ↓
同步更新 history
```

用户数据属于 D 级风险区域。

---

## 10. Storage 与 Cache 基线

### 用户数据 Storage

```text
PREFIX = tvbox:v2:
BACKUP_PREFIX = tvbox:backup:
```

Storage 提供：

```text
read
write
remove
has
backup
readBackup
```

### Cache

```text
CACHE_PREFIX = tvbox:cache:v1:
```

实际 namespace：

```text
SOURCE
MOVIE
DETAIL
EPISODE
LIVE_SOURCE
LIVE_CHANNEL
EPG
IMAGE
PLAYBACK_TEMP
```

缓存有 TTL、最大条目数、单条序列化大小限制和 prune。

用户数据与缓存在代码中有不同 prefix，但二者都使用浏览器 localStorage；因此存储介质相同、生命周期不同。

---

## 11. State 基线

### Persistent State

```text
src/state/persistentStateStore.js
```

负责聚合：

```text
favorites
history
progress
searches
settings
selectedSources
migration
sources
```

### Session State

```text
src/state/sessionStateStore.js
```

当前只保存：

```text
tab
route
selected
```

不持久化。

### Page State

```text
src/state/pageStateStore.js
```

使用：

```text
tvbox-react.page-state.v1
```

保存：

```text
home.scrollTop
movies.category/page/pageSize/filters/sort/query/scrollTop
search.query/scrollTop
live.category/scrollTop
```

---

## 12. Source 链

### Source Repository

```text
src/repositories/sourceRepository.js
```

负责 source：

```text
sourceId
name
sourceType
sourceRef
url
enabled
status
capabilities
```

### Source Runtime

```text
sourceRuntimeService
  ↓
syncAllSources
  ↓
movie/live source execution
```

### Source Registry

```text
sourceRegistryService
  ↓
adapter registry
```

### Movie Adapter

```text
movieAdapter
movieRegistry
jsonParser
normalizeMovie
```

### Live Adapter

```text
liveAdapter
liveRegistry
jsonParser
m3uParser
xmlParser
normalizeLive
```

---

## 13. Playback 链

真实结构：

```text
App.playMovie / App.playLive
  ↓
playbackService.createVODRequest / createLiveRequest
  ↓
PlaybackRequest
  ↓
PlaybackCandidate
  ↓
PlaybackPage
  ↓
playbackService.createController
  ↓
createPlaybackCore
  ↓
parserService
  ↓
parserChain
  ├─ hlsParser
  ├─ dashParser
  └─ directParser
  ↓
ResolvedMediaInput
  ↓
Player Adapter
```

Playback 运行时还有：

```text
playbackTaskRegistry
playbackSessionManager
playbackStateMachine
playbackEventBus
playbackEventProtocol
playbackErrorPolicy
playbackLifecyclePolicy
playbackNetworkPolicy
playbackResourceManager
```

Playback 是 C 级核心区域。

---

## 14. Parser 基线

当前 Parser Chain：

```text
hlsParser
dashParser
directParser
```

通过：

```text
createParserChain
  ↓
matches
  ↓
resolve
  ↓
createResolvedMediaInput
```

ParserService 当前统一暴露：

```text
parserService.chain
parserService.resolve
```

---

## 15. Player 基线

### Interface

```text
src/player/playerInterface.js
```

定义播放器状态、能力和 Adapter Contract。

### HTML5

```text
src/player/html5PlayerAdapter.js
```

实际使用 HTMLMediaElement 事件：

```text
loadstart
waiting
canplay
playing
pause
timeupdate
ended
error
```

并支持：

```text
seek
volume
audio track
subtitle track
quality
release
```

### Native

```text
src/player/nativePlayerAdapter.js
```

探测：

```text
window.TVBoxAndroidBridge
window.Android
window.tvboxBridge
```

并通过桥接方法调用：

```text
loadMedia
prepareMedia
playMedia
pauseMedia
seekMedia
stopMedia
setVolume
getAudioTracks
getSubtitleTracks
selectAudioTrack
selectSubtitleTrack
getQualities
selectQuality
releaseMedia
```

---

## 16. Android / WebView 基线

仓库当前没有独立 Android Gradle 工程；当前实际存在的是 WebView Runtime 抽象。

核心文件：

```text
src/runtime/webViewRuntime.js
```

当前实际能力：

```text
bridge detection
fullscreen
orientation
app state
lifecycle
system Back bridge
```

Android Host 与 Web 层通过 `window.TVBoxWebView` 和候选 Native bridge 交互。

因此 Baseline 结论：

```text
Android Native 工程：当前仓库未发现
WebView Runtime：存在
Native Player Adapter：存在
Native Bridge 实现：不在当前仓库
```

---

## 17. Worker / Service Worker / WASM

当前仓库树中未发现：

```text
Web Worker
Service Worker
WASM 文件
Worker 注册入口
Service Worker 注册入口
```

因此不把这些能力假定为已存在。

---

## 18. 文件级登记重点

| 文件 | 实际职责 | 风险 |
|---|---|---|
| src/main.jsx | React 根入口 | B |
| src/app/App.jsx | 应用协调、导航、播放入口、Source 同步、WebView 生命周期 | B/C |
| src/pages/MainPage.jsx | 我的/收藏/历史/源管理/设置等页面分支 | B |
| src/pages/PlaybackPage.jsx | 播放页面 | C |
| src/features/movie/MovieFeature.jsx | 影视 Feature、详情、集数、播放相关 UI | C |
| src/features/live/LiveFeature.jsx | Live Feature、频道 UI | C |
| src/services/movieService.js | 影视业务服务 | B |
| src/services/liveService.js | Live 业务服务 | B/C |
| src/services/playbackService.js | Playback Request/Controller | C |
| src/services/userDataService.js | 收藏/历史/进度/搜索/设置业务 | D |
| src/repositories/userDataRepository.js | 用户数据持久化入口 | D |
| src/storage/storage.js | localStorage 用户数据底层 | D |
| src/storage/cache.js | Cache 生命周期 | B |
| src/adapters/movie/movieAdapter.js | 影视源适配 | B/C |
| src/adapters/live/liveAdapter.js | Live 源适配 | B/C |
| src/parsers/parserChain.js | 播放解析链 | C |
| src/playback/playbackCore.js | Playback 核心 | C |
| src/player/html5PlayerAdapter.js | HTML5 Player | C |
| src/player/nativePlayerAdapter.js | Native Player Bridge | C |
| src/runtime/webViewRuntime.js | WebView 生命周期/桥接 | C |

---

## 19. 函数级登记

核心函数/入口实际登记：

```text
main.jsx
└─ createRoot(...).render(AppRoot)

App.jsx
├─ App
├─ reloadSources
├─ openMovie
├─ playMovie
├─ testSource
├─ saveSources
├─ setSourceEnabled
├─ setSourceActive
├─ removeSource
├─ nav
├─ openSearchHistory
├─ openLiveChannel
├─ playLive
├─ AppFrame
├─ BottomNav
└─ FirstLaunch

playbackService.js
├─ getVODCandidates
├─ getLiveCandidates
├─ createVODRequest
├─ createLiveRequest
├─ createTask
├─ createController
└─ createPlaybackTask

userDataService.js
├─ getSettings
├─ saveSettings
├─ getSnapshot
├─ setSelectedSource
├─ clearSelectedSource
├─ migrateContentIdentities
├─ touchFavorite
├─ toggleLiveFavorite
├─ toggleFavorite
├─ recordMoviePlay
├─ recordLivePlay
├─ recordProgress
├─ clearHistory
├─ removeSearch
├─ clearSearches
├─ recordSearch
└─ clearUserData

parserChain.js
├─ createParserChain
├─ list
└─ resolve

runtime/webViewRuntime.js
├─ capabilities
├─ call
├─ setFullscreen
├─ requestOrientation
├─ getAppState
├─ notifyLifecycle
└─ mount
```

这些函数是后续重构时必须保护的核心调用点。

---

## 20. 真实调用链

### 影视播放

```text
App.playMovie
→ playbackService.createVODRequest
→ createPlaybackRequest
→ PlaybackPage
→ playbackService.createController
→ createPlaybackCore
→ parserService.resolve
→ parserChain.resolve
→ hls/dash/direct parser
→ ResolvedMediaInput
→ Player Adapter
```

### Live 播放

```text
App.playLive
→ playbackService.createLiveRequest
→ PlaybackPage
→ playbackService.createController
→ playbackCore
→ parserService
→ Player Adapter
```

### 用户进度

```text
Playback event
→ persistentStateStore.recordProgress
→ userDataService.recordProgress
→ userDataRepository.saveProgress
→ storage.write
→ localStorage
```

### Source 管理

```text
MainPage Source UI
→ App callback
→ persistentStateStore.saveSources
→ sourceRepository.saveAll
→ storage.write
→ localStorage
→ reloadSources
→ sourceRuntimeService
```

---

## 21. 构建与依赖基线

当前 `package.json`：

```text
name: tvbox-react-v1
version: 0.3.0
type: module
```

依赖：

```text
@vitejs/plugin-react: latest
vite: latest
react: latest
react-dom: latest
lucide-react: latest
```

构建工具：

```text
Vite
```

当前 scripts：

```text
dev
build
preview
test:live
test:playback
test:parser
test:player
test:state
test:movie
test
test:cache
test:errors
test:webview-runtime
test:performance
test:data-contract
test:acceptance
test:architecture
test:execution
test:react
```

当前 package.json 未声明 `engines.node`。

当前仓库根目录未发现：

```text
package-lock.json
pnpm-lock.yaml
yarn.lock
```

因此当前 Baseline 的构建可重复性风险需要记录，但 08 不在此阶段修改依赖版本或包管理器。

---

## 22. 测试基线

当前明确存在：

```text
tests/react/page-boundaries.test.mjs
```

该测试检查：

```text
App 使用 playbackService
App 不直接 createPlaybackCore
PlaybackPage 不直接 createPlaybackCore
MovieFeature 不直接 createPlaybackCore
```

同时 package.json 的多个 test script 引用了根目录 `scripts-test-*.mjs`。

当前仓库树中未发现这些对应文件。

因此测试基线明确记录：

```text
React boundary test：存在
完整 test script 对应实现：当前不完整
Unit/Integration/E2E 完整矩阵：未形成
lint script：未声明
```

这是 Baseline 异常记录，不在 08 阶段通过删除/重写测试命令来掩盖。

---

## 23. 环境与配置基线

当前存在：

```text
src/config/index.js
```

但当前仓库未发现：

```text
.env
.env.example
独立生产环境配置
独立测试环境配置
Service Worker runtime config
```

因此当前环境配置基线：

```text
Vite config：存在
业务 config：存在
.env 体系：未发现
Node engines：未声明
独立部署配置：未发现
```

---

## 24. 构建部署基线

```text
vite.config.js
└─ defineConfig
   └─ @vitejs/plugin-react
```

当前没有独立 Android Gradle 构建系统。

当前没有在 Baseline 中假定具体 CDN、反向代理、SPA fallback 或生产域名。

---

## 25. 安全信任边界

外部不可信数据主要经过：

```text
External Source
→ Request
→ Raw Response
→ Adapter Parser
→ Normalize
→ Model
→ Playback Candidate
→ Parser
→ Player
```

Playback Candidate 当前可携带：

```text
mediaUrl
headers
cookies
referer
userAgent
token
expiresAt
parserHint
playerHint
```

Native Player 会把部分播放参数发送到 Native Bridge。

因此：

```text
Source URL
Headers
Cookies
Referer
UserAgent
Token
Native Bridge payload
```

均属于敏感信任边界。

当前 Baseline 不在 08 阶段改变这些边界。

---

## 26. 架构违规/耦合清单

按 07 规则检查当前实际代码，记录如下：

| 位置 | 实际关系 | 类型 | 风险 |
|---|---|---|---|
| App.jsx | App → 多个 Service/Store/Runtime | 入口协调过重 | 中 |
| MainPage.jsx | Page → Blob/FileReader/URL | 页面直接处理源导入导出 | 中 |
| MovieFeature.jsx | Feature → playbackService + persistent state | UI/业务耦合 | 中 |
| PlaybackPage.jsx | Page → Playback Controller/Player 生命周期 | 播放边界耦合 | 高 |
| nativePlayerAdapter.js | Player → window Native Bridge | 全局桥接 | 高 |
| userDataRepository.js | Repository → storage + migration | D 级用户数据耦合 | 高 |

这些是现状登记，不等于 08 阶段立即重构。

---

## 27. 重复实现调查

当前需要后续重点核查的重复/相似区域：

```text
movie/jsonParser.js
live/jsonParser.js

movieAdapter / liveAdapter
normalizeMovie / normalizeLive

persistentStateStore / userDataService / repositories

playbackService / playbackCore / PlaybackPage

HTML5 Player / Native Player
```

目前不能仅凭名称判定为可安全合并，因为它们可能存在不同生命周期、不同领域边界。

---

## 28. 复杂度与热点

### 播放热区

```text
playbackCore.js
playbackService.js
parserChain.js
player adapters
PlaybackPage.jsx
```

### 数据热区

```text
movieAdapter.js
liveAdapter.js
movieService.js
liveService.js
contentService.js
userDataService.js
storage.js
cache.js
```

### 页面热区

```text
App.jsx
MainPage.jsx
MovieFeature.jsx
LiveFeature.jsx
PlaybackPage.jsx
```

### 用户数据热区

```text
userDataService.js
userDataRepository.js
persistentStateStore.js
storage.js
migration.js
```

---

## 29. 当前与目标架构差异

只记录事实：

### 当前

```text
App
→ Feature/Page
→ Service/State
```

同时部分页面直接处理浏览器 API。

### 目标

```text
Page
→ Feature
→ Service
→ Adapter
→ Data
→ Storage
```

### 当前播放

```text
App
→ playbackService
→ PlaybackPage
→ PlaybackCore
→ Parser
→ Player
```

该结构已经基本存在，但仍有页面、业务状态、播放控制之间的直接耦合。

---

## 30. 重构风险等级

| 等级 | 当前模块 |
|---|---|
| A | 普通 UI、展示组件、样式 |
| B | Service、Adapter、Store、一般数据转换 |
| C | Parser、Playback、Player、Source Runtime、网络核心 |
| D | 收藏、历史、进度、Source Config、Settings、Migration、Storage |

当前最高保护对象：

```text
D：用户数据
C：播放核心
C：Parser
C：Player
```

---

## 31. 功能保护清单

后续修改前必须保护：

```text
首页
影视列表
影视搜索
搜索历史
详情
集数
影视播放
Live 分类
Live 频道
Live 多线路
Live 播放
收藏
历史
进度
Source 管理
Source 导入
Source 导出
设置
数据清理
WebView
全屏
返回
前后台生命周期
播放器释放
```

其中 D 级：

```text
收藏
历史
进度
Source 配置
Settings
Migration
```

---

## 32. 数据风险清单

| 数据 | 存储 | 生命周期 | 风险 |
|---|---|---|---|
| favorites | tvbox:v2 | 持久 | D |
| history | tvbox:v2 | 持久 | D |
| progress | tvbox:v2 | 持久 | D |
| searches | tvbox:v2 | 持久 | D |
| settings | tvbox:v2 | 持久 | D |
| selectedSources | tvbox:v2 | 持久 | D |
| sources | tvbox:v2 | 持久 | D |
| migration state | tvbox:v2 | 持久 | D |
| source/movie/detail cache | tvbox:cache:v1 | TTL | B |
| live/EPG cache | tvbox:cache:v1 | TTL | B |
| playback temp cache | tvbox:cache:v1 | TTL | C |
| sessionState | memory | 会话 | C |
| playback task | memory | 会话 | C |

---

## 33. 页面恢复基线

可持久恢复：

```text
home scroll
movie category/page/filter/sort/query/scroll
search query/scroll
live category/scroll
favorites
history
progress
searches
sources
settings
selectedSources
```

当前不持久：

```text
current route
current selected object
current playback task
current playback candidate index
```

---

## 34. 全局/隐式依赖登记

当前存在：

```text
window.localStorage
window.TVBoxAndroidBridge
window.Android
window.tvboxBridge
window.TVBoxWebView
document.fullscreenElement
document.visibilityState
window.Blob
window.FileReader
URL.createObjectURL
```

Native Player 和 WebView Runtime 都使用 Window 挂载对象。

这是后续架构改造的重要隐式依赖。

---

## 35. 01～07 到当前实现的映射

| 前置阶段 | 当前实现 |
|---|---|
| 01 产品总架构 | App / Pages / Features / Services / Runtime |
| 02 页面规格 | MainPage / MovieFeature / LiveFeature / PlaybackPage |
| 03 数据体系 | models / state / repositories / storage |
| 04 影视源 | adapters/movie / movieService / movieSourceService |
| 05 Live 源 | adapters/live / liveService |
| 06 播放解析 | playback / parsers / player |
| 07 React 规范 | main.jsx / App.jsx / Feature / Page / Store / boundary test |

当前代码已经具备对应模块，但“规范目标”与“当前事实”必须分开理解。

---

## 36. 改造前置关系

当前后续改造的事实依赖顺序：

```text
数据模型
  ↓
Source Adapter / Registry
  ↓
Service
  ↓
Playback Candidate
  ↓
Playback Kernel
  ↓
Player
  ↓
Page / Feature
```

用户数据保护贯穿所有层。

播放核心变更不得先于 Playback Candidate、Parser、Player 的接口稳定。

---

## 37. 08 Baseline 完成性矩阵

| 08 要求 | Baseline 状态 |
|---|---|
| 项目文件结构 | 已登记 |
| React 入口 | 已登记 |
| 页面结构 | 已登记 |
| 页面依赖 | 已登记 |
| 影视数据流 | 已登记 |
| Live 数据流 | 已登记 |
| 数据模型 | 已登记 |
| 状态管理 | 已登记 |
| 影视源实现 | 已登记 |
| Live 源实现 | 已登记 |
| Parser 实现 | 已登记 |
| Player 实现 | 已登记 |
| Playback 实现 | 已登记 |
| Android/WebView | 已登记 |
| 文件级登记 | 已登记 |
| 函数级登记 | 核心函数已登记 |
| 真实调用链 | 已登记 |
| 用户数据链 | 已登记 |
| 播放链 | 已登记 |
| Source 链 | 已登记 |
| 构建依赖 | 已登记 |
| 环境配置 | 已登记 |
| Worker/Service Worker | 已核查 |
| 构建部署 | 已登记 |
| 安全边界 | 已登记 |
| 性能/复杂度热点 | 已登记 |
| 测试基线 | 已登记 |
| 功能保护清单 | 已登记 |
| 数据风险 | 已登记 |
| 重复代码 | 已登记 |
| 架构违规 | 已登记 |
| 重构风险等级 | 已登记 |
| 模块依赖 | 已登记 |
| 01～07 映射 | 已登记 |
| 后续改造前置关系 | 已登记 |

---

## 38. 已知基线异常

以下项目属于“当前项目存在的问题”，不是本阶段偷偷修复：

1. package.json 中多个 test script 指向当前仓库树中未发现的 `scripts-test-*.mjs`。
2. package.json 依赖使用 `latest`，且没有 lockfile。
3. package.json 没有声明 Node engines。
4. App.jsx 是当前高耦合协调入口。
5. MainPage.jsx 直接处理 Source JSON 文件导入/导出浏览器 API。
6. Native Player / WebView Runtime 依赖 Window 全局桥接。
7. 部分 Settings 菜单当前主要表现为 UI 入口，并非所有项目都已形成独立持久化设置字段。
8. 当前没有独立 Android Native 工程。
9. 当前没有发现 Worker / Service Worker / WASM。
10. 用户数据与缓存虽然使用不同 prefix，但共同落在 localStorage。

这些项目全部冻结在本 Baseline，后续应由 09 阶段决定是否以及如何处理。

---

## 39. 08 与 09 的边界

本文件只回答：

> 当前项目实际上是什么。

不在本阶段执行：

```text
重构
目录大迁移
Parser 合并
Player 重写
Storage 替换
UI 大改
业务重写
```

后续 09 才负责：

```text
当前
↓
目标
↓
差距
↓
改造顺序
↓
风险
↓
实施
```

---

## 40. Baseline 冻结结论

在基准提交 `9bed9eaf8627277dbcdb30f46a68e47397ce904f` 下，项目的实际结构、页面、数据流、播放链、用户数据链、Source 链、Parser、Player、Runtime、构建依赖、测试现状、安全边界、风险等级和后续前置关系均已在本文件登记。

本文件不代表“当前代码没有问题”；它代表：

> **当前代码已经被完整记录，可以作为后续 09 阶段差距分析的基准。**
