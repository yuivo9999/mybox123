# 测试与验收执行记录

> 对应施工方案：24_测试与验收体系
> 记录原则：自动化结果负责回归门槛；Android/WebView 真机项必须人工记录设备、版本、步骤与结果。

## 一、自动化测试分层

| 层级 | 入口 | 覆盖 |
|---|---|---|
| Model / Utility Unit | `npm run test:data-contract` | ID 稳定性、缺失字段、影视/Live 数据边界、持久化与缓存隔离 |
| Adapter Contract | `scripts-test-live.mjs` | M3U/JSON Live 输入、空 EPG、多源合并 |
| Service Integration | `scripts-test-movie-feature.mjs`、`scripts-test-live.mjs` | 列表、搜索、详情、剧集、Live 服务 |
| Playback Integration | `scripts-test-playback.mjs` | 候选、失败切换、重试、过期候选、VOD/Live |
| Parser | `scripts-test-parser.mjs` | MP4/HLS、非法输入、Session 失效 |
| Player Core | `scripts-test-player-core.mjs` | 状态机、重试策略、资源 owner/release |
| State | `scripts-test-state.mjs` | 页面状态订阅、patch、reset |
| Cache / Error | `scripts-test-cache.mjs`、`scripts-test-errors.mjs` | TTL、stale、用户数据保护、错误脱敏 |
| WebView | `scripts-test-webview-runtime.mjs` | Bridge 缺失降级、运行环境能力 |
| Performance | `scripts-test-performance.mjs` | 并发上限、请求复用 |
| Production Build | `vite build` | 生产构建阻断 |

## 二、统一回归入口

`npm test` 现在进入 `scripts-test-acceptance.mjs`，按上述顺序执行全部自动化检查，并追加生产构建。

任何一个自动化检查失败，验收进程退出码为 1，不允许把结果记录成“完成”。

## 三、P0 / P1 门槛

### P0：阻断

- 收藏、历史、进度、设置、源配置丢失或被错误覆盖。
- 播放核心无法创建任务、无法 release、候选切换失效。
- 生产构建失败。
- 核心数据模型 ID 不稳定或跨源身份错误。

### P1：核心功能阻断

- Source/Parser/Player 主链路失败。
- 页面核心业务无法进入或返回。
- WebView Bridge 核心能力不可用且没有安全降级。

P0 必须修复后才能继续；P1 必须关闭或明确登记阻断项。

## 四、Android / WebView 人工验收

每次真机验收记录：

- 设备型号：
- Android 版本：
- WebView 版本：
- APK/构建版本：
- 日期：
- 结果：

### 必测项

1. 冷启动与首屏。
2. Android 返回键：页面返回、播放页退出、无历史时退出。
3. 全屏进入/退出。
4. 竖屏方向保持。
5. 前后台切换后播放状态。
6. Wi-Fi/移动网络切换。
7. Cookie / Storage 持久化。
8. Bridge 不存在时仍能安全启动。
9. Bridge 方法抛异常时不拖垮页面。
10. 播放暂停、恢复、退出后资源释放。
11. 切换候选后旧播放器资源释放。
12. 收藏/历史/进度在重启后仍存在。

## 五、失败记录模板

- 用例：
- 层级：
- 结果：PASS / FAIL / BLOCKED
- 设备/环境：
- 前置条件：
- 复现步骤：
- 预期：
- 实际：
- 错误信息：
- 影响等级：P0 / P1 / P2 / P3
- 修复提交：
- 回归结果：
- 回退点：

## 六、最终冻结条件

- [ ] `npm test` 全部通过。
- [ ] 生产构建通过。
- [ ] P0 = 0。
- [ ] P1 = 0 或已有明确阻断记录。
- [ ] Android/WebView 必测项完成。
- [ ] 每个失败项有复现步骤与回归结果。
- [ ] 收藏、历史、进度、设置、源配置未发生回归。
