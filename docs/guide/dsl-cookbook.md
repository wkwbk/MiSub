---
title: 算子与安全 DSL 实战配方库
description: 基于 MiSub Operator Chain 与无 eval 安全表达式 DSL 的 10 个生产级配置配方，涵盖过滤、正则捕获组重命名、按地区协议编号、智能去重、置顶排序与 DSL 条件改写。
---

# 算子与安全 DSL 实战配方库

以下配方均可直接配置在 **全局 `defaultOperators`**、**单订阅 `operators`** 或 **订阅组 `operators` / 单订阅覆盖对象**中。

> [!TIP]
> 算子链按数组顺序依次执行。建议遵循 **`filter`（过滤） → `rename.regex`（清洗） → `dedup`（去重） → `sort`（排序） → `rename.template` / `script`（编号与格式化）** 的顺序，以确保序号递增与最终地区顺序完全对齐。

---

## 配方 1：排除广告、官网、剩余流量与到期提示节点

过滤上游订阅中常见的信息展示类假节点。`filter.exclude` 会同时匹配节点原名、`cleanName`、地区名与 ISO 地区代码：

```json
[
  {
    "type": "filter",
    "enabled": true,
    "params": {
      "exclude": {
        "enabled": true,
        "rules": [
          "剩余流量|套餐到期|过期时间|官网|网址|更新订阅|重置|群组|频道|Traffic|Expire"
        ]
      }
    }
  }
]
```

---

## 配方 2：仅保留指定主力地区与低延迟现代协议

`filter.regions` 支持匹配中文或英文地区名；`filter.protocols` 会自动把 `hy2` 归一化为 `hysteria2`、`hy` 归一化为 `hysteria`、`socks5` 归一化为 `socks`：

```json
[
  {
    "type": "filter",
    "enabled": true,
    "params": {
      "regions": {
        "enabled": true,
        "values": ["香港", "台湾", "日本", "新加坡", "美国"]
      },
      "protocols": {
        "enabled": true,
        "values": ["vless", "trojan", "hy2", "anytls", "ss"]
      }
    }
  }
]
```

---

## 配方 3：剔除高倍率计费节点（2x 及以上）

排除诸如 `2x`、`x3`、`3.5倍`、`5x` 等高倍率消耗流量的节点：

```json
[
  {
    "type": "filter",
    "enabled": true,
    "params": {
      "exclude": {
        "enabled": true,
        "rules": [
          "(?:^|[^0-9])(?:[2-9]|\\d{2,})(?:\\.\\d+)?\\s*[xX倍]"
        ]
      }
    }
  }
]
```

---

## 配方 4：正则捕获组提取倍率标签并统一地区前缀

在 `rename.regex` 的 `replacement` 中可直接引用内置模板变量（如 `{regionZh}`、`{emoji}`）和正则捕获组（`{g1}`、`{g2}` 或命名捕获组 `{g_name}`）：

```json
[
  {
    "type": "rename",
    "enabled": true,
    "params": {
      "regex": {
        "enabled": true,
        "rules": [
          {
            "pattern": ".*?(\\d+(?:\\.\\d+)?[xX倍]).*",
            "replacement": "{emoji} {regionZh} | {g1}",
            "flags": "i"
          },
          {
            "pattern": "\\s*\\|\\s*$",
            "replacement": "",
            "flags": "g"
          }
        ]
      }
    }
  }
]
```

---

## 配方 5：按「地区 + 协议」独立分组补零编号

`rename.template` 支持 `indexScope` 设为 `region`、`global`、`protocol` 或 `regionProtocol`，并通过 `:02` 修饰符对 `{index}` 自动补零、`:UPPER` 将协议转为大写：

```json
[
  {
    "type": "rename",
    "enabled": true,
    "params": {
      "template": {
        "enabled": true,
        "template": "{emoji} {regionZh}-{protocol:UPPER} {index:02}",
        "indexScope": "regionProtocol",
        "offset": 1
      }
    }
  }
]
```

输出示例：`🇭🇰 香港-VLESS 01`、`🇭🇰 香港-VLESS 02`、`🇭🇰 香港-TROJAN 01`。

---

## 配方 6：同服务器端口多协议智能去重

当同一台落地机器同时下发了 `ss`、`trojan`、`vless` 等多个协议链接时，关闭 `includeProtocol: false` 并配置 `prefer.protocolOrder`，仅保留优先级最高的协议（优先级相同时保留节点名更长者）：

```json
[
  {
    "type": "dedup",
    "enabled": true,
    "params": {
      "mode": "serverPort",
      "includeProtocol": false,
      "prefer": {
        "protocolOrder": ["vless", "hysteria2", "tuic", "trojan", "ss"]
      }
    }
  }
]
```

---

## 配方 7：专线置顶 + 自定义地区顺序多级排序

`sort` 支持 `regex`、`region`、`regionZh`、`protocol`、`name`、`server`、`port` 排序键。以下配方将包含 `IEPL`、`IPLC` 或 `家宽` 的节点优先置顶，随后按亚洲优先地区顺序和名称排序：

```json
[
  {
    "type": "sort",
    "enabled": true,
    "params": {
      "keys": [
        {
          "key": "regex",
          "order": "asc",
          "customOrder": ["IEPL|IPLC", "家宽|住宅|ISP"]
        },
        {
          "key": "region",
          "order": "asc",
          "customOrder": ["香港", "新加坡", "日本", "台湾", "美国", "韩国"]
        },
        {
          "key": "name",
          "order": "asc"
        }
      ]
    }
  }
]
```

---

## 配方 8：DSL 条件过滤 — 仅保留特定端口范围或 TLS/专线节点

使用安全声明式 `script`（`params.dsl`）结合数值比较运算符与 `match()` / `contains()`：

```json
[
  {
    "type": "script",
    "enabled": true,
    "params": {
      "dsl": [
        {
          "action": "filter",
          "expression": "port === 443 || port >= 10000 || match(name, 'IEPL|IPLC|BGP')"
        }
      ]
    }
  }
]
```

> [!NOTE]
> `evaluateDslExpression` 支持 `===`、`!==`、`>=`、`<=`、`>`、`<` 与逻辑连接符 `&&`、`||`，且完全无 `eval` 沙箱风险。

---

## 配方 9：DSL 条件重命名 — 专线自动打标与未知地区优雅兜底

在 `action: "rename"` 的 `template` 中可组合 `pick()`、`match()`、`fallback()`、`upper()` 与 `replace()` 函数：

```json
[
  {
    "type": "script",
    "enabled": true,
    "params": {
      "dsl": [
        {
          "action": "rename",
          "template": "{emoji} {pick(match(name, 'IEPL|IPLC'), '⚡ ', '')}{fallback(regionZh, '其他')} · {upper(protocol)}-{replace(name, '\\\\s+', '')} #{index}"
        }
      ]
    }
  }
]
```

---

## 配方 10：生产级全链路标准清洗流水线

将「排废 → 地区筛选 → 协议去重 → 多级排序 → 统一命名」组合为一套可直接用于主力订阅组的完整算子链：

```json
[
  {
    "type": "filter",
    "enabled": true,
    "params": {
      "exclude": {
        "enabled": true,
        "rules": ["剩余流量|到期|官网|重置|测试|Test"]
      },
      "protocols": {
        "enabled": true,
        "values": ["vless", "trojan", "hy2", "tuic", "ss", "anytls"]
      }
    }
  },
  {
    "type": "dedup",
    "enabled": true,
    "params": {
      "mode": "serverPort",
      "includeProtocol": false,
      "prefer": {
        "protocolOrder": ["vless", "hysteria2", "trojan", "tuic", "anytls", "ss"]
      }
    }
  },
  {
    "type": "sort",
    "enabled": true,
    "params": {
      "keys": [
        { "key": "regex", "order": "asc", "customOrder": ["IEPL|IPLC|专线"] },
        { "key": "region", "order": "asc", "customOrder": ["香港", "台湾", "日本", "新加坡", "美国"] },
        { "key": "protocol", "order": "asc" },
        { "key": "name", "order": "asc" }
      ]
    }
  },
  {
    "type": "rename",
    "enabled": true,
    "params": {
      "template": {
        "enabled": true,
        "template": "{emoji} {regionZh} | {protocol:UPPER} {index:02}",
        "indexScope": "region",
        "offset": 1
      }
    }
  }
]
```
