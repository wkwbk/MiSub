---
title: 规则模板、DNS 与链式代理
description: 内置规则等级与 6 套模板预设、自定义规则模板管理（RuleTemplateManager）、可视化分流规则编排、DNS 模式与覆写（DnsOverrideCard）及 Mihomo 链式代理（dialer-proxy）配置指南。
---

# 规则模板、DNS 与链式代理

MiSub 内置统一的模板模型与渲染管线（位于 `functions/modules/subscription/templates/`），覆盖 Clash/Mihomo、Sing-Box、Surge、Loon、Quantumult X、Egern 与 Shadowrocket 多端规则输出。

---

## 1. 内置规则等级与自定义规则模板

### 1.1 规则等级（`ruleLevel`）

当未启用可视化分流且未使用远程/自定义规则模板时，内置模板按 `ruleLevel` 生成对应规模的策略组与分流规则（定义于 `builtin-rules-provider.ts`）：

| 等级值 | 适用场景 | 策略组特点 |
| :--- | :--- | :--- |
| `base` | 极简轻量 | 仅保留基础选择、自动选择与核心直连/代理分组 |
| `std`（默认） | 日常主力 | 包含地区分组、常用流媒体、AI 服务、国内直连与广告拦截 |
| `full` | 全量分流 | 完整覆盖各类细分子规则集与地区策略组 |
| `relay` | 链式代理模式 | 自动注入 `🌍 总出口`、`🔗 链式代理` 与 `入口节点` 分组对 |
| `none` | 禁用内置等级 | 使用远端模板或自定义模板时自动强制设为 `none` |

**生效优先级**：`URL ?level= / ?ruleLevel=` > 订阅组配置 > 全局配置 > 默认值 `std`。

### 1.2 内置 INI 模板预设（`builtin:<id>`）

`builtin-template-registry.ts` 提供了 6 套开箱即用的 INI 模板预设（按 ACL4SSR 风格编写）：

| 模板 ID | 名称 | 定位说明 |
| :--- | :--- | :--- |
| `clash_misub_minimal` | MiSub 极简默认分流 | 保留主选择、自动选择、故障转移、流媒体与电报基础分流 |
| `clash_acl4ssr_lite` | ACL4SSR 精简分流 | 轻量 ACL4SSR 常用分组与规则（香港/日本/美国地区组） |
| `clash_misub_media_ai` | MiSub 流媒体与 AI 分流 | 强化 OpenAI、Claude、Gemini、Grok、DeepSeek 等 AI 服务与流媒体分流 |
| `clash_acl4ssr_full` | ACL4SSR 完整分流 | 含游戏平台（Steam）、AI 服务、流媒体等高完整度预设 |
| `clash_exclusive_ai` | MiSub 深度 AI 开发者模板 | 强化 OpenAI/Claude 路由与固定节点漂移保护策略 |
| `clash_game_optimized` | MiSub 游戏加速竞技模板 | 针对 Steam / Epic / Sony 等游戏平台规则配置低容差 `url-test` |

> [!TIP]
> **规则源自动加速**：生成远程规则 provider 或规则集 URL 时，后端会根据 `request.cf.country`（或 `CF-IPCountry` 请求头）判断请求来源。国内请求（`CN` 或本地开发未带国家头）自动前置 `https://gh-proxy.org/` 加速拉取 GitHub 规则文件，境外请求直连原地址。

### 1.3 自定义规则模板管理（`RuleTemplateManager`）

在管理后台「服务集成 / 模板设置」中可通过 `RuleTemplateManager.vue`（对应后端 `/api/rule_templates`）创建与编辑自定义 INI 模板，并在全局或订阅组中通过 `custom:<templateId>` 引用：

- 模板结构支持标准 `[custom]` 区块：
  - `ruleset=<策略组名>,<规则源 URL 或 []GEOIP,CN / []FINAL>`
  - `custom_proxy_group=<组名>\`<类型>\`<成员或正则>\`<测速URL>\`<间隔>,,<容差>`
  - `enable_rule_generator=true` / `overwrite_original_rules=true`
  - 可选 `custom_chain_proxy=...` 声明链式代理（见第 4 节）
- 支持通过 `<%regionStrategyChain%>` 等模板占位符自动展开当前订阅中实际存在的地区策略组（界面提供「模板变量说明」弹窗 `TemplateVariablesModal` 辅助查阅）。

---

## 2. 可视化分流规则编排（`VisualTransformCard`）

当开启 `builtinTransform.visualRulesEnabled` 时，系统不再使用旧式等级开关，而是由 `visual-rules-builder.ts` 统一构建 Clash、Sing-Box 与 Surge 的策略组和规则集：

### 2.1 三套内置分类预设（`VISUAL_RULE_PRESETS`）

| 预设名 | 包含规则分类 |
| :--- | :--- |
| `minimal` | `private`（私有网络）、`cn_services`（国内服务）、`non_cn`（非中国） |
| `balanced`（默认） | `ai_services`、`youtube`、`google`、`private`、`cn_services`、`telegram`、`github`、`non_cn` |
| `comprehensive` | 全部分类（额外包含 `ad_block`、`bilibili`、`microsoft`、`apple`、`netflix`、`disney`、`spotify`、`tiktok`、`steam`、`scholar`、`finance`、`cloud` 等） |

### 2.2 自定义分流规则（`CustomVisualRule`）

除了勾选内置分类，还可在可视化面板中添加自定义规则项，每条规则支持：

- `name`：生成的策略组名称（在策略组列表靠前展示）；
- `action`：默认路由动作（`proxy` / `direct` / `reject`）；
- 匹配条件列表：`domainSuffix`、`domainKeyword`、`ipCidr`、`srcIpCidr`、`ruleSet`。

### 2.3 通用开关与基础配置覆写

`builtinTransform` 还控制以下生成行为：
- `groupByCountry`：是否按节点国家/地区自动生成地区策略组（默认 `true`）；
- `includeAutoSelect`：是否生成 `♻️ 自动选择`（`url-test`）组（默认 `true`）；
- `enableClashApi` / `externalController` / `externalUiDownloadUrl`：控制 Clash / Mihomo 外部控制面板监听地址与 UI 下载源；
- `baseConfig`（`clash` / `singbox` / `surge`）：允许分别填入基础配置片段进行合并覆写，同时后端通过受保护键集合（`CLASH_PROTECTED_KEYS`、`SINGBOX_PROTECTED_KEYS`、`SURGE_PROTECTED_SECTIONS`）防止覆盖生成的 `proxies`、`proxy-groups`、`rules`、`rule-providers` 与 `outbounds`。

---

## 3. DNS 模式与 DNS 覆写（`safe-dns.ts` & `DnsOverrideCard`）

### 3.1 `dnsMode` 双模式策略

可通过全局设置或订阅 URL 查询参数 `?dns-mode=` / `?dnsMode=` 切换 DNS 策略（仅识别 `'polluted'`，其余回退 `'clean'`）：

- **`clean`（默认）**：
  - 国内解析：`223.5.5.5`、`119.29.29.29`；
  - 境外解析：统一使用免引导 IP 型 DoH（`https://8.8.8.8/dns-query`、`https://1.1.1.1/dns-query`），并通过隐藏策略组 **`🌐 DNS 出口`** 代理出站，避免先解析 DoH 域名带来的死锁与 UDP 明文污染风险。
- **`polluted`**：面向污染网络的解析策略配置。

### 3.2 自定义 DNS 覆写（`DnsOverrideCard`）

在后台「服务集成 → DNS 覆写卡片（`DnsOverrideCard.vue`）」中可输入 **JSON** 或 **YAML** 格式的 DNS 配置片段（字段对应 `settings.customDnsOverride`），失焦时前端会调用 `js-yaml` / `JSON.parse` 实时校验对象合法性。

后端 `safe-dns.ts` 会自动兼容顶层对象或嵌套在 `dns:` 下的配置，并安全合并受支持的控制字段（包括 `cache-algorithm`、`fake-ip-range`、`fake-ip-filter-mode`、`fake-ip-ttl`、`use-hosts`、`use-system-hosts` 及自定义 nameserver 规则校验）。

---

## 4. Mihomo（Clash Meta）链式代理（`dialer-proxy`）

由于 Mihomo 内核已移除旧版 `relay` 策略组类型，MiSub 在 `functions/modules/subscription/core/mihomo-chain-proxy.ts` 中基于节点级 **`dialer-proxy`** 实现了无环路的两跳链式代理展开机制：

```text
  [客户端流量] ──▶ [落地策略组 (select)]
                        │ 选中「落地组 - 节点 B」(自动注入 dialer-proxy: 前置组)
                        ▼
                   [前置/中转组 (select)] ──▶ [原始中转节点 A] ──▶ [落地节点 B] ──▶ 目标站点
```

### 4.1 两种配置方式

1. **内置规则等级 `relay`**
   - 将全局或订阅组的 `ruleLevel` 设为 `relay`（或在订阅 URL 后附加 `?level=relay`）。
   - 系统自动生成 **`🌍 总出口`** → **`🔗 链式代理`** 与 **`入口节点`** 分组对：
     - Clash/Mihomo 与 Sing-Box：通过 `materializeRelayChainNodes` 自动将落地节点展开为指向 `入口节点` 的副本；
     - Loon / Surge INI：通过 `applyIniRelayGroupPair` 映射为原生的 `relay` 组对。

2. **自定义 INI 模板声明 `custom_chain_proxy`**
   - 在自定义规则模板或内置 INI 的 `[custom]` 段添加如下指令（使用反引号 `` ` `` 分隔）：

```ini
custom_chain_proxy=<落地组名>`<前置组名>[`<落地副本名前缀>]
```

示例：

```ini
[custom]
custom_proxy_group=🚀 入口中转`select`.*
custom_proxy_group=🛡️ 静态落地`select`.*
custom_chain_proxy=🛡️ 静态落地`🚀 入口中转`[链式] 
```

省略第三个参数时，默认前缀为 `"<落地组名> - "`。

### 4.2 自动展开与防环路机制

`applyMihomoChainProxy` 与 `applyMihomoChainProxyToClashConfig` 在渲染阶段自动完成以下安全处理：

1. **副本物化与重名消解**：为所有基础节点复制生成带 `'dialer-proxy': <前置组名>` 的落地副本（重名时自动追加 `(2)`、` (3)` 后缀），并将落地组转为 `select` 且仅包含这些落地副本。
2. **清理前置组环路**：从前置组中自动移除落地组名和所有落地副本名，防止前置组误选落地节点造成 `dialer-proxy` 自指环路。
3. **移除动态筛选器**：对参与链式配对的策略组清空 `include-all`、`include-all-proxies`、`use`、`filter`、`exclude-filter` 等动态字段，避免客户端运行时把落地副本重新吸回前置组。

### 4.3 生效条件与兼容降级

- **生效条件**：仅当订阅请求被 `isMetaCore(userAgent, searchParams)` 识别为 Mihomo / Clash Meta 核心（如 Mihomo、Clash Verge、FlClash、Stash、Nekobox、Mihomo Party 等 UA），或订阅 URL 显式附加 **`?meta=true` / `?meta=1`** 时，才会注入 `dialer-proxy` 与展开副本。
- **非 Meta 客户端兼容**：对于普通传统 Clash 等不支持 `dialer-proxy` 的客户端，`enableDialerProxy` 自动为 `false`，仅保留常规 `select` 策略组，保证配置文件可正常导入不报错。
