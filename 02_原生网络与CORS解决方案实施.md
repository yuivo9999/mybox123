# 阶段 2：原生网络与 CORS 解决方案实施

> 上游：`01_Android容器与Capacitor实施.md`  
> 下游：`03_React请求层Android适配实施.md`

## 1. 本阶段目标

真正解决：

> Android App 内第三方接口请求受到浏览器/WebView CORS 限制的问题。

本阶段的目标不是“关闭 CORS”，而是建立：

```
React
  ↓
统一请求适配
  ↓
Android Native HTTP
  ↓
第三方服务器
```

浏览器环境则保持：

```
React
  ↓
浏览器 HTTP
  ↓
第三方服务器
```

---

## 2. 核心原则

### 2.1 Native HTTP 才是 CORS 问题的关键出口

Android 原生网络请求不处于浏览器 JavaScript CORS 执行环境中。

因此：

- Native HTTP 请求不应通过 WebView 的 fetch 再绕一圈；
- React 只负责调用统一请求接口；
- Android 原生层负责真正的 HTTP；
- 原生层把必要结果返回给 Web 层。

### 2.2 不得把“关闭 WebView 安全”作为主要方案

禁止以以下方式冒充完成：

- allow universal access from file URLs
- 任意 origin 放行
- 关闭证书验证
- 接受所有 TLS
- 任意 JavaScript bridge
- 无限制混合内容

除非有非常明确且经过验证的特定需求，否则采用最小权限。

---

## 3. 先审计现有请求形态

实施前必须搜索整个仓库，列出真实网络调用：

- fetch
- XMLHttpRequest
- URL
- HLS.js loader
- 图片加载
- JSON
- XML
- 文本
- POST
- GET
- headers
- cookies
- authorization
- redirect
- timeout
- abort

必须形成“请求分类表”。

建议：

| 请求类型 | 是否需要 Native | 原因 |
|---|---|---|
| JSON API | 待确认 | 可能受 CORS |
| XML API | 待确认 | 可能受 CORS |
| 解析接口 | 待确认 | 常见跨域来源 |
| 图片 | 待确认 | 不一定需要 |
| M3U8 | 单独判断 | 播放链路 |
| HLS segment | 单独判断 | 播放器链路 |
| MP4 | 单独判断 | 播放器链路 |

**不能因为 API 需要 Native，就直接把所有媒体流量也改走普通 JSON HTTP bridge。**

---

## 4. Native HTTP 接口设计

建议建立明确、有限的请求协议。

例如：

```js
{
  method: "GET",
  url: "https://example.com/api",
  headers: {
    "Accept": "application/json"
  },
  body: null,
  timeoutMs: 15000,
  responseType: "text"
}
```

返回：

```js
{
  ok: true,
  status: 200,
  headers: {},
  body: "...",
}
```

失败：

```js
{
  ok: false,
  code: "NETWORK_ERROR",
  status: 0,
  message: "..."
}
```

最终字段必须根据项目实际代码确定，不允许为了“看起来统一”而与现有 errorService / requestManager 冲突。

---

## 5. 必须支持的能力

根据实际调用审计决定，但至少检查：

- GET
- POST
- 请求 headers
- body
- timeout
- HTTP status
- response text
- JSON 解析
- redirect
- Abort / cancellation
- Cookie 是否需要
- Authorization 是否需要
- User-Agent 是否需要
- Referer 是否需要

对于敏感 Header：

- 不允许无条件暴露；
- 不允许日志打印 token；
- 不允许把完整 Cookie 写入普通调试日志。

---

## 6. Bridge 安全要求

Android → JavaScript 的 bridge 必须采用白名单方法。

例如只允许：

- nativeHttpRequest
- setFullscreen
- requestOrientation
- getAppState
- notifyLifecycle

不得提供任意 Java/Kotlin 方法调用。

请求 URL 必须经过合理校验，至少防止协议/格式错误。

如果业务确实需要访问任意第三方源，应明确记录这是产品需求，而不是偷偷扩大 bridge 权限。

---

## 7. 错误处理

必须接入现有错误体系：

- `src/services/errorService.js`
- `src/services/requestManager.js`

不能出现：

```
try {
  nativeRequest(...)
} catch {}
```

然后业务静默失败。

必须区分：

- timeout
- abort
- DNS
- TLS
- HTTP status
- malformed response
- bridge unavailable
- unsupported response type

---

## 8. Android 明文 HTTP

如果源列表中确实存在 `http://`：

- 不能默认认为 Android 一定允许；
- 不能为了省事全局放开；
- 应确定最小可用配置；
- 记录哪些域名必须使用明文；
- 如果可以升级到 HTTPS，应优先 HTTPS。

---

## 9. 本阶段不要做

- 不要修改所有业务页面来调用 Native API。
- 不要把 requestManager 删除。
- 不要直接在组件中判断 Android。
- 不要为了通过一次测试关闭全部安全限制。
- 不要把播放媒体请求与普通 API 请求混为一谈。

---

## 10. 完成定义

本阶段完成必须意味着：

- [ ] 请求分类完成。
- [ ] Native HTTP API 已实现。
- [ ] JS bridge 已实现。
- [ ] bridge 方法白名单明确。
- [ ] GET/POST 等实际需要的能力已实现。
- [ ] timeout/abort 已处理。
- [ ] status/error 已处理。
- [ ] Cookie/Header 需求已处理。
- [ ] HTTP 明文问题已调查。
- [ ] 没有把媒体播放链路错误地当普通 API。
- [ ] requestManager 接入方案已明确并可交给阶段 3。

---

## 11. 阶段交接记录

- 阶段：
- 完成日期：
- Commit：
- Native HTTP 实现位置：
- JS bridge 实现位置：
- 支持的 method：
- 支持的 responseType：
- timeout：
- abort：
- Cookie：
- Header：
- HTTP 明文策略：
- 播放链路处理方式：
- 已验证的真实请求：
- 未完成：
- 风险：
- 下一阶段：
- 下一 AI 第一件事：
- 下一 AI 必须先检查：
- 不要重复做：
