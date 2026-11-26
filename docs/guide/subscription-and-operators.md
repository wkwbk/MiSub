---
title: 订阅聚合与算子管道
description: 订阅 URL 路由规范、多客户端自动识别与查询参数、内置与外部转换模式、远端模板占位符，以及节点过滤/重命名/去重/排序算子链与安全 DSL 用法。
---

# 订阅聚合与算子管道

## 订阅聚合与 URL 路由规范

根据 `functions/modules/subscription/core/request-context.ts` 的路由解析逻辑，MiSub 仅支持统一的两段式（或带 `.conf` 后缀的三段式）订阅 URL：

```text
/{subPath}/{identifier}
/{subPath}/{identifier}/{filename}.conf
```

- **`subPath`**：取自全局设置中的 `profileToken`（经 `normalizeSubPath` 规范化，默认值为 `sub`）。
- **全量订阅模式**：当 `identifier === config.myToken` 时，聚合所有已启用（`enabled: true`）的上游订阅。
- **订阅组（Profile）模式**：按 `profile.id` 或 `profile.customId` 查找对应订阅组，按如下顺序聚合节点：
  1. 订阅组引用的上游订阅（支持纯 ID 字符串或 `{ id, exclude, include, operators }` 订阅组级覆盖对象）；
  2. 订阅组引用的手动节点（`manualNodes`）；
  3. 嵌套组合订阅组（`subProfiles`），通过 `handleProfileMode` 并发解析并利用 `visited` 集合防止循环引用。

> [!TIP]
> 若关闭全局设置「允许浏览器打开订阅链接（`allowBrowserSubAccess`）」，系统会通过 `isBrowserAgent` 识别常见桌面/移动浏览器并直接返回伪装拦截响应（`createBlockedResponse`），而代理客户端 User-Agent 与带 `callback_token` 的请求不受影响。

---

## 多客户端输出与 URL 控制参数

### 客户端自动识别与 `target` 参数

`determineTargetFormat(userAgent, searchParams)` 会优先读取 URL 中的 `target` 参数或简写查询参数，未显式指定时再按请求头 `User-Agent` 自动识别：

| 客户端 | `target` 参数值 | URL 简写参数 | 自动识别说明 |
| :--- | :--- | :--- | :--- |
| Clash / Mihomo / Stash / FlClash / Verge / Nekobox | `clash` | `?clash` | 匹配 `mihomo`、`clash.meta`、`flclash`、`stash`、`surfboard`、`clash` 等 UA；Meta 核心特性可通过 `&meta=true` 或 `&meta=1` 强制开启 |
| Sing-Box / Hiddify | `singbox` / `sing-box` | `?singbox` | **注意**：Hiddify 的 UA 同时包含 ClashMeta 与 sing-box，系统会优先匹配为 `singbox` 并默认走内置引擎；如需 Clash 格式请显式传 `target=clash` |
| Surge | `surge`（可配合 `ver=4`） | `?surge` | 自动解析 UA 中的版本号，iOS Surge 默认使用 `surge&ver=4` |
| Loon | `loon` | `?loon` | 匹配 `loon` UA |
| Quantumult X | `quanx` | `?quanx` | 匹配 `quantumult x` / `quantumult` UA |
| Egern | `egern` | `?egern` | 匹配 `egern` UA |
| Shadowrocket（小火箭） | `shadowrocket` | `?shadowrocket` 或 `client=shadowrocket` | **注意**：Shadowrocket UA 默认自适应输出 `base64` 节点列表；传 `target=shadowrocket` 或 `client=shadowrocket` 可输出完整 Shadowrocket 规则配置 |
| V2rayN / V2rayNG / Base64 | `base64` | `?base64` / `?v2ray` / `?trojan` | `v2ray`、`trojan` 简写均映射为 `base64`；未知 UA 默认回退为 `base64` |
| 纯节点明文列表 | `nodes` | `?nodes` | 返回 `text/plain` 换行分隔的原始/处理后节点 URI（不进行 Base64 编码） |

### 常用 URL 查询参数

在订阅链接后附加查询参数可临时覆盖订阅组或全局配置：

| 参数 | 示例值 | 作用说明 |
| :--- | :--- | :--- |
| `target` / `ver` | `target=surge&ver=5` | 显式指定目标格式及 Surge 版本号 |
| `meta` | `meta=true` 或 `meta=1` | 强制启用 Mihomo（Clash Meta）语法输出（如 `dialer-proxy`） |
| `include` / `exclude` | `include=香港\|日本` | 覆盖过滤规则（每行正则经 `isSafeUserRegexPattern` ReDoS 安全校验，单行上限 256 字符） |
| `rename` | `rename=old@new\|A@B` | 动态追加正则重命名算子，以 `\|` 分隔多组，单次请求最多注入 20 组（均经安全正则校验） |
| `emoji` | `true` / `false` | 控制是否为节点名称注入或移除国旗 Emoji |
| `udp` / `tfo` / `scv` | `true` / `false` / `1` | 控制 UDP 转发、TCP Fast Open 与跳过证书校验（`skip-cert-verify`） |
| `list` | `true` | 外部转换模式下作为节点列表导出开关透传 |
| `level` / `ruleLevel` | `std` 等 | 覆盖内置模板规则等级（使用远端或自定义模板时强制为 `none`） |
| `dns-mode` / `dnsMode` | `clean` / `polluted` | 控制内置模板的 DNS 模式，默认 `clean` |
| `engine` / `builtin` | `engine=builtin` 或 `builtin=external` | 临时切换内置引擎（`builtin`）或第三方转换后端（`external`） |
| `refresh` / `nocache` / `debug` | `?refresh=1` | 强制绕过节点缓存与拉取防刷守卫，重新回源抓取并刷新缓存 |

### 内置引擎 vs 第三方转换后端与远端模板占位符

- **统一流水线顺序**：`上游订阅 / 手动节点` → `MiSub 预处理（拉取、解析、过滤、算子链重命名/去重/排序）` → `内置适配器渲染` 或 `第三方转换后端`。
- **第三方后端内联模式**：在 `external` 模式下，MiSub 会将预处理后的节点列表用 `|` 拼接并内联发送给外部后端（默认 `https://subapi.cmliussss.net/sub`），避免外部后端再次回调 MiSub 链接引发抓取失败。
- **远端模板占位符**：当使用远端或自定义规则模板时，模板中可使用以下占位符：
  - `<%proxies%>`（节点块）、`<%rules%>`（规则块）
  - `<%fileName%>`（输出文件名）、`<%interval%>`（刷新间隔秒数）、`<%managedConfigUrl%>`（托管配置 URL）、`<%targetFormat%>`（目标格式）、`<%nodeCount%>`（节点总数）
  - `<%regionGroups%>`（地区分组 JSON）、`<%regionGroupNames%>`（地区分组名称列表）、`<%regionGroupCounts%>`（地区分组及数量）、`<%regionGroupList%>`（地区分组清单）

---

## 节点算子链（Operator Chain）

`packages/core/src/operators/operator-runner.ts` 中的 `runOperatorChain(nodeUrls, operators, context)` 按数组顺序串行执行算子，所有算子契约均在 `packages/core/src/schemas/entities.ts` 中通过 Zod Schema 定义。支持以下 5 种 `type`：

### 1. `filter` — 节点过滤

支持四个子条件（按配置顺序依次过滤）：

- **`include` / `exclude`**：按行拆分的多条正则表达式（或 `{ pattern, replacement, flags }` 对象）。匹配时**同时检查**节点原始名称 `name`、`metadata.cleanName`、中文地区 `regionZh`、英文地区 `region` 以及 ISO 地区码 `regionCode`（例如直接匹配 `HK` 或 `香港`）。
- **`protocols`**：按协议白名单筛选，内置归一化映射：`hy2` → `hysteria2`、`hy` → `hysteria`、`socks5` → `socks`。
- **`regions`**：按地区名称白名单（支持中文或英文地区名）筛选。

### 2. `rename` — 正则与模板重命名

支持 `regex`（正则替换）和 `template`（格式化模板）两种方式，且可同时开启（先执行 `regex` 再执行 `template`）：

- **`regex` 替换**：`replacement` 支持引用内置变量（如 `{regionZh}`）及正则捕获组（`{g1}`、`{g2}` 或命名捕获组 `{g_name}`）。
- **`template` 模板重命名**：
  - **可用变量**：`{name}`、`{protocol}`、`{region}`、`{regionZh}`、`{emoji}`、`{server}`、`{port}`、`{index}`（分组内序号）、`{globalIndex}`（全局序号）。
  - **变量修饰符**：`:UPPER`（全大写）、`:lower`（全小写）、`:Title`（首字母大写）、`:zh`（将 `{region}` 转为中文地区名）、`{index:02}` / `{index:03}`（数字补零宽度）。
  - **计数作用域 `indexScope`**：可选 `region`（默认，按地区分别从 1 开始编号）、`global`（全局递增）、`protocol`（按协议分组）、`regionProtocol`（按地区+协议分组），可通过 `offset` / `indexStart` 指定起始偏移量。

### 3. `dedup` — 智能去重

- **`mode`**：
  - `serverPort`（默认）：基于 `server:port`（当 `includeProtocol !== false` 时为 `protocol|server:port`）去重；无主机端口时回退为去除 `#fragment` 后的 URL。
  - `url`：基于去除 `#fragment` 后的完整节点 URL 去重。
- **`prefer.protocolOrder`**：当同一服务器与端口存在多个协议节点时，按数组顺序优先保留靠前的协议（如 `["vless", "trojan", "hysteria2", "ss"]`）；若协议优先级相同，则保留节点名称更长者。

### 4. `sort` — 多级排序

通过 `params.keys` 数组指定多级排序键（`{ key, order, customOrder }`）：

- 支持键：`region`、`regionZh`、`protocol`、`name`、`server`、`port`、`regex`（通过 `customOrder` 传入正则数组实现指定节点置顶）。
- 内置默认顺序：
  - `region` 默认：`['香港', '台湾', '日本', '新加坡', '美国', '韩国', '英国', '德国', '法国', '加拿大']`
  - `protocol` 默认：`['vless', 'trojan', 'vmess', 'hysteria2', 'ss', 'ssr', 'anytls']`

### 5. `script` — 安全声明式 DSL

出于安全考虑（Cloudflare Workers 环境禁用动态脚本求值），`operator-runner.ts` 已禁用旧版 `params.code` 与 `params.url`，统一使用 **`params.dsl`** 步骤数组，由 `packages/core/src/operators/expression-dsl.ts` 无 `eval` 安全求值：

- **步骤动作 `action`**：
  - `filter`：支持字符串条件表达式或结构化条件对象 `{ field, op, value, flags }`。
  - `rename`：通过 `template` / `expression` 模板（`{...}` 内调用字段与 DSL 函数）生成新名称。
- **表达式运算符与条件 `op`**：
  - 字符串表达式支持：`===`、`!==`、`>=`、`<=`、`>`、`<`、`&&`、`||`。
  - 结构化条件支持 `op`：`eq` / `equals`、`ne` / `not_equals`、`contains`、`not_contains`、`match` / `regex`、`in`。
- **内置 DSL 函数**：
  - `upper(val)`、`lower(val)`、`title(val)`、`trim(val)`
  - `replace(str, pattern, replacement, flags)`
  - `contains(str, substr)`、`match(str, pattern, flags)`
  - `fallback(...values)`、`pick(cond, truthy, falsy)`

#### 算子链配置示例

以下示例演示「排除无效流量提示节点 → 过滤指定协议 → 使用 DSL 将节点重命名为统一格式 → 按协议优先级去重 → 按地区排序」的完整算子链：

```json
[
  {
    "type": "filter",
    "enabled": true,
    "params": {
      "exclude": {
        "enabled": true,
        "rules": ["剩余流量|到期时间|官网|重置"]
      },
      "protocols": {
        "enabled": true,
        "values": ["vless", "trojan", "hy2", "ss"]
      }
    }
  },
  {
    "type": "script",
    "enabled": true,
    "params": {
      "dsl": [
        {
          "action": "filter",
          "field": "regionCode",
          "op": "in",
          "value": ["HK", "TW", "JP", "SG", "US"]
        },
        {
          "action": "rename",
          "template": "{emoji} {fallback(regionZh, '其他')} | {upper(protocol)} {index}"
        }
      ]
    }
  },
  {
    "type": "dedup",
    "enabled": true,
    "params": {
      "mode": "serverPort",
      "includeProtocol": false,
      "prefer": {
        "protocolOrder": ["vless", "trojan", "hysteria2", "ss"]
      }
    }
  },
  {
    "type": "sort",
    "enabled": true,
    "params": {
      "keys": [
        { "key": "region", "order": "asc" },
        { "key": "name", "order": "asc" }
      ]
    }
  }
]
```
