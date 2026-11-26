---
title: 多协议支持与客户端兼容矩阵
description: MiSub 支持的 18 种入站代理协议在 7 大目标客户端（Clash/Mihomo、Sing-Box、Surge、Loon、Quantumult X、Egern、Shadowrocket）中的支持度、前置兼容分析、SS2022 校验及空策略组修剪机制。
---

# 多协议支持与客户端兼容矩阵

MiSub 基于统一节点中间表示 `NodeIR` 与 `ClashProxy` 解析层，统一处理多协议入站解析、前端兼容性分析与客户端出站转换。

---

## 1. 18 种标准化协议与入站别名体系

`packages/core/src/schemas/node-ir.ts` 中的 `NODE_IR_PROTOCOLS` 定义了 18 种标准协议枚举：

`ss`、`ssr`、`vmess`、`vless`、`trojan`、`hysteria`、`hysteria2`、`tuic`、`anytls`、`snell`、`socks5`、`http`、`https`、`wireguard`、`naive+https`、`naive+quic`、`naive+http`、`mierus`

### 入站方案名归一化与容器格式

根据 `packages/core/src/protocols/constants.ts` 与 `url-to-clash.ts`：

- **协议别名归一化**（`detectNodeProtocol`）：
  - `hy2://` → `hysteria2`
  - `hy://` → `hysteria`
  - `socks://` / `socks5-tls://` → `socks5`
  - `wg://` → `wireguard`
  - `naive+https://`、`naive+quic://`、`naive+http://` → `naive`
- **容器/批量格式解包**：
  - `ssd://`（ShadowsocksD 订阅格式，由 `parseSsdUrl` 展开）
  - `v2rayn://`（v2rayN 专有 JSON 分享链接，通过 `decodeV2raynNodeUrl` 解包为 `hysteria2`、`tuic`、`trojan`、`vless`、`anytls` 或 `ss`）
- **纯 UDP 协议标识**（`UDP_ONLY_SCHEMES`）：`hysteria`、`hysteria2`、`hy`、`hy2`、`tuic`、`wireguard`、`wg`。这类协议在浏览器 Fetch 与 Cloudflare Workers 服务端 TCPing（`cloudflare:sockets`）中无法直接建立 TCP 握手探测。

---

## 2. 7 大目标客户端出站兼容矩阵

以下矩阵严格依据 `functions/modules/subscription/adapters/generators/` 与 `templates/renderers/` 中的真实代码分支整理（`✅` 原生生成，`⚠️` 有前置/版本或传输限制，`⏭️` 自动跳过不输出）：

| 协议 / 格式 | Clash / Mihomo | Sing-Box | Surge | Loon | Quantumult X | Egern | Shadowrocket (`?target=shadowrocket`) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Shadowsocks (`ss`)** | ✅ 含 SS2022 与插件 | ✅ 自动转 SIP003 `plugin` | ✅ 含 obfs / WS 插件 | ✅ 含 obfs / WS | ⚠️ 不支持 `2022-*` | ✅ 含 obfs / WS/WSS | ✅ 含 obfs / WS |
| **ShadowsocksR (`ssr`)** | ✅ | ⏭️ | ⏭️ | ⚠️ 仅分析器/特定支持 | ✅ | ✅ 通用回退映射 | ✅ |
| **VMess** | ✅ | ✅ | ⚠️ 限 `tcp`/`ws`（默认 `vmess-aead=true`） | ⚠️ 限 `tcp`/`ws` | ⚠️ 限 `tcp`/`ws` | ✅ | ✅ 含 `ws`/`grpc` |
| **VLESS** | ✅ 含 REALITY / Vision / XHTTP | ⚠️ 限 `encryption=none`，不支持 `xhttp`/`kcp` | ⏭️ **明确跳过** | ⚠️ 限 `encryption=none`，不支持 `kcp`/`quic` | ⚠️ v1.5.5+ 支持 TLS/REALITY/Vision，限 `tcp`/`ws` | ✅ 含 Vision / REALITY | ✅ 含 `xtls=2` / REALITY / `ws`/`grpc` |
| **Trojan** | ✅ | ⚠️ 不支持 `xhttp`/`kcp` | ⚠️ 限 `tcp`/`ws`，不支持 REALITY | ⚠️ 限 `tcp`/`ws` | ⚠️ 限 `tcp`/`ws`，不支持 REALITY | ✅ 独立 `websocket` 字段 | ✅ 含 `ws`/`grpc` |
| **Hysteria (v1)** | ⏭️ 仅 `NodeIR` 层支持 | ✅ | ⏭️ | ⏭️ | ⏭️ | ⏭️ | ⏭️ |
| **Hysteria2 (`hy2`)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 含 `salamander` / `mport` |
| **TUIC** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 默认 `version: 5` | ✅ 含 `uuid`/`token` |
| **AnyTLS** | ✅ | ✅ | ✅ | ✅ | ✅ (v1.6.0+) | ✅ | ✅ |
| **Snell (v1–v5)** | ✅ | ✅ | ✅ 含 `reuse`/`tfo` | ✅ 含 `reuse`/`tfo`/`obfs` | ⏭️ | ✅ 通用映射 | ⏭️ |
| **WireGuard (`wg`)** | ✅ | ✅ | ✅ 生成 `[WireGuard ...]` 段 | ✅ | ⏭️ | ✅ 通用映射 | ✅ 生成 `[WireGuard WG_...]` 段 |
| **HTTP / HTTPS** | ✅ | ✅ | ✅ | ⏭️ 内置生成器跳过 | ✅ | ✅ 通用映射 | ✅ |
| **SOCKS5 / SOCKS5-TLS** | ✅ | ✅ | ✅ | ⏭️ 内置生成器跳过 | ✅ | ✅ 通用映射 | ✅ |
| **NaiveProxy (`naive+*`)** | ⏭️ 仅 `NodeIR` 层解析 | ⏭️ `urlToClashProxy` 未接入 | ⏭️ | ⏭️ | ⏭️ | ⏭️ | ⏭️ |
| **Mieru (`mierus://`)** | ✅ 输出 `type: mieru` | ⏭️ | ⏭️ | ⏭️ | ⏭️ | ✅ 通用映射 | ⏭️ |

> [!NOTE]
> - **Shadowrocket 默认输出行为**：当请求未带 `?target=shadowrocket` 或 `?client=shadowrocket` 时，Shadowrocket 的 UA 默认返回原始 `base64` 节点列表；显式指定参数后才渲染完整的原生 `.conf` 配置。
> - **Local 回环节点过滤**：`urlsToClashProxies` 会自动过滤指向本地回环地址的节点（`isLocalProxyEndpoint`），仅保留流量/到期虚拟提示节点（`isVirtualInfoProxy`）。

---

## 3. 前端兼容性分析与自动容错机制

### 3.1 前端实时兼容性徽章（`client-compatibility.ts`）

`getNodeClientCompatibility(url)` 提取节点的 8 项核心特征：`protocol`、`transport`、`security`、`flow`、`encryption`、`cipher`、`isSS2022`、`plugin`，实时评估 **Xray**、**Sing-box**、**Mihomo**、**Surge**、**Loon**、**QuanX** 六大客户端/内核的兼容状态，并在 `NodeClientBadges.vue` 中展示不支持原因（如 `unsupportedProtocol`、`unsupportedTransport`、`unsupportedReality`、`unsupportedVlessEncryption`、`unsupportedSS2022`、`unsupportedPlugin`）。

### 3.2 SS2022 密钥长度校验与修复（`ss2022-validator.ts`）

针对 Shadowsocks 2022 常见的密钥长度误配，`validateSS2022Node` 会解码 Base64 密码并验证字节长度：
- `2022-blake3-aes-128-gcm`：必须为 **16 字节**；
- `2022-blake3-aes-256-gcm`：必须为 **32 字节**。

当检测到加密方法与实际密钥长度写反（例如 32 字节密钥配了 `aes-128`）时，返回 `suggestedCipher` 并支持通过 `fixSS2022Node` 自动修正为匹配的加密套件。

### 3.3 VLESS XHTTP `extra` 双向无损映射（`xhttp-extra.ts`）

对于 VLESS XHTTP 节点，`xhttp-extra.ts` 严格对齐 Mihomo 源码字段，将 Xray 风格的 `extra` JSON 双向映射为 Mihomo 字段：
- `xmux`（`maxConnections`、`maxConcurrency`、`cMaxReuseTimes`、`hMaxRequestTimes`、`hMaxReusableSecs`、`hKeepAlivePeriod`）→ `reuse-settings`；
- `downloadSettings`（独立 `address`/`port`/`security` 含 TLS 与 REALITY、`tlsSettings`/`realitySettings`）→ `download-settings`。

### 3.4 Sing-Box 插件防污染隔离

在 `builtin-singbox-generator.ts` 中，Shadowsocks 节点仅使用 `applySingboxShadowsocksPlugin` 生成 SIP003 的 `plugin` 与 `plugin_opts`，绝不混入 V2Ray 专用的 `transport` 字段，避免新版 Sing-Box 客户端（如 SFA）严格校验报错。

### 3.5 不兼容节点剔除与空策略组递归修剪

当特定目标客户端跳过不兼容协议（例如 Surge 跳过 VLESS 节点）后，可能导致某些地区分组或业务分流组内没有任何可用代理。MiSub 模板引擎会在渲染前执行 `pruneEmptyGroups` / `pruneProxyGroups`：

1. 移除成员数组为空的策略组；
2. 递归从其他上层策略组的 `members` 中删除对该空组的引用；
3. 删除 `rules` 中指向该空组的分流规则，确保最终下发给客户端的配置 100% 合法可加载。
