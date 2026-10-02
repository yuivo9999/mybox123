# 26_实际改造执行记录

> 对应施工清单：26_实际改造执行总清单
> 本记录只登记本次最终收口实际落地的工程改动；不替代 24/25 的设计与冻结文档。

## 一、施工范围

本次以现有 main 分支为基线，执行 26 的最终收口动作：

- 不改用户数据存储 key 与既有数据协议。
- 不重写已经建立的 Movie / Live / Source / Playback / Parser / Player 核心实现。
- 不删除最后一个兼容入口。
- 增加最终施工清单的自动化存在性、目录、模块与依赖边界检查。
- 将最终施工检查纳入 npm test 总验收入口。

## 二、实际修改

### 26-01：增加最终执行清单门槛

新增：

/scripts-test-execution-checklist.mjs

检查：

- 冻结目录是否存在。
- App / Page / Feature / Service / Adapter / Model / Playback / Player / Parser / Runtime / State / Storage 核心模块是否存在。
- 24/25 已建立的自动化验证脚本是否仍存在。
- main.jsx 是否保持纯启动入口。
- 页面、组件、Adapter、Storage、main 的禁止依赖方向是否出现回归。
- 总验收入口是否仍包含架构与执行门槛。

### 26-02：把执行清单接入总验收

package.json 新增：

npm run test:execution

同时 npm test 对应的 scripts-test-acceptance.mjs 首先执行最终执行清单，再执行架构冻结、数据、缓存、错误、Live、Playback、Parser、Player、State、Movie、WebView、性能检查，最后执行生产构建。

### 26-03：保持回退边界

本次没有删除既有业务实现，没有修改用户数据协议，没有改变 Playback Candidate 数据身份，也没有改变 Android/WebView 的既有运行时入口。

## 三、验收条件

自动化收口要求：

1. 最终执行清单通过。
2. 25 架构冻结检查通过。
3. 24 自动化测试全部通过。
4. 生产构建通过。
5. P0 自动化阻断项为 0。
6. Android/WebView 真机项目仍按 24 的人工验收表执行。

## 四、人工验收

以下项目不能由仓库脚本替代，继续沿用 24 的人工记录：

- Android 冷启动与首屏。
- 返回键与播放页退出。
- 竖屏方向。
- 前后台切换。
- 网络切换。
- Cookie / Storage 持久化。
- Bridge 缺失与 Bridge 异常降级。
- 播放暂停、恢复、退出后的资源释放。
- 候选切换后的旧播放器资源释放。
- 收藏、历史、进度、设置、源配置重启后保持。

## 五、回退点

本次修改点均为独立测试/验收收口项。若新增门槛导致旧环境无法通过，优先回退：

- scripts-test-execution-checklist.mjs
- package.json 的 test:execution
- scripts-test-acceptance.mjs 中的 Final execution checklist 项

不以删除业务保护代码的方式解决验收失败。

## 六、最终施工状态

- [x] 26 最终执行门槛落地。
- [x] 总验收入口接入执行门槛。
- [x] 目录与模块存在性纳入最终检查。
- [x] 依赖方向纳入最终检查。
- [x] 用户数据保护原则保持。
- [x] Playback / Parser / Player 边界保持。
- [ ] Android/WebView 真机人工验收：仍需在实际设备环境执行。
- [ ] 最终线上/发布环境验收：由发布环境执行。
