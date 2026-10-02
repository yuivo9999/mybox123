# 阶段 3：React 请求层 Android 适配实施

> 上游：`02_原生网络与CORS解决方案实施.md`  
> 下游：`04_GitHub_Actions_APK构建实施.md`

## 1. 本阶段目标

把阶段 2 的 Native HTTP 能力真正接入现有 React 架构。

重点是：

```
业务服务
  ↓
统一请求入口
  ↓
requestManager
  ↓
运行环境判断
  ├─ Browser → fetch
  └─ Android → Native HTTP bridge
```

而不是：

```
每个页面自己判断 Android
每个页面自己调用 bridge
```

---

## 2. 当前已知核心文件

必须首先检查：

- `src/services/requestManager.js`
- `src/runtime/webViewRuntime.js`
- `src/services/errorService.js`
- 所有实际调用 fetch / XHR 的 service
- 播放器 / HLS 相关网络入口

当前 requestManager 已提供：

- concurrency
- request deduplication
- AbortController
- cancel
- cancelAll

这些行为必须继续保留。

---

## 3. 设计要求

建议增加独立请求适配器，例如：

```
requestAdapter
├── browserRequest
└── nativeRequest
```

具体文件名由实施 AI 根据当前代码决定。

requestManager 应继续负责：

- 生命周期
- 并发
- 去重
- 取消

adapter 负责：

- 浏览器 fetch
- Native bridge

这样可以避免职责混乱。

---

## 4. Android 判断

不能只写：

```js
if (navigator.userAgent.includes("Android")) ...
```

更可靠的优先判断应来自现有：

```js
webViewRuntime.capabilities.bridge
```

但必须注意：

> “Android 设备”与“可用 Native HTTP bridge”不是同一个概念。

因此请求层真正关心的是：

```
nativeHttp capability 是否存在
```

而不是单纯 user-agent。

---

## 5. 浏览器兼容

当没有 Native HTTP bridge 时：

- 必须继续使用原来的浏览器请求方式；
- 不能因为增加 Android 支持而导致桌面浏览器全部请求失败；
- GitHub Pages / Web 环境必须保持原有逻辑。

因此：

```
Native HTTP 可用 → Native
Native HTTP 不可用 → Browser
```

---

## 6. 取消与超时

必须把：

```
requestManager.cancel(key)
requestManager.cancelAll()
```

与 Native 请求的取消机制对应起来。

如果 Android 原生层暂时无法真正取消底层 HTTP：

- 也必须在 JS 层避免已取消结果继续污染业务状态；
- 不能假装“已经真正取消”。

---

## 7. 数据契约

Native 返回的数据结构必须在 JS 层统一。

例如：

```
{
  ok,
  status,
  headers,
  body,
  error/code
}
```

最终以阶段 2 实际实现为准。

禁止出现：

- Browser 返回 Response；
- Android 返回自定义对象；
- 业务层同时兼容两套对象。

应该在 adapter 层统一。

---

## 8. 与现有 Service 的关系

优先让这些 service 使用统一请求能力：

- contentService
- liveService
- movieService
- movieSourceService
- playbackService
- sourceConfigService
- sourceManagementService
- sourceRegistryService
- sourceRuntimeService
- userDataService

但必须逐个检查。

**不能机械替换所有网络调用。**

对于：

- HLS.js
- 视频播放
- 原生媒体
- 图片加载

应单独判断。

---

## 9. 测试要求

至少验证：

### 浏览器模式

- Native bridge 不存在；
- 请求仍走浏览器；
- 原有请求错误行为不改变。

### Android 模式

- Native bridge 存在；
- CORS 敏感 API 走 Native；
- 返回数据能被现有 service 消费；
- timeout 正确；
- error 正确；
- cancel 不污染状态。

### Bridge 异常

Native bridge 不可用时：

- 不应出现死循环；
- 不应无限重试；
- 不应泄露敏感数据；
- 应返回统一错误。

---

## 10. 完成定义

- [ ] requestManager 保留。
- [ ] Browser adapter 保留。
- [ ] Native adapter 已接入。
- [ ] 运行环境通过 capability 判断。
- [ ] 业务层不直接散落 bridge 调用。
- [ ] 关键 service 已逐项审计。
- [ ] HLS / 播放链路未被错误改造。
- [ ] cancel / timeout 已处理。
- [ ] errorService 对接完成。
- [ ] 浏览器模式未被破坏。
- [ ] 至少存在 Android Native 请求验证证据。

---

## 11. 阶段交接记录

- 阶段：
- 完成日期：
- Commit：
- request adapter：
- 修改 requestManager：
- 修改的 service：
- 未修改且明确保留的网络链路：
- Browser 行为：
- Android 行为：
- cancel：
- timeout：
- error：
- 已验证请求：
- 未完成：
- 风险：
- 下一阶段：
- 下一 AI 第一件事：
- 下一 AI 必须先检查：
- 不要重复做：
