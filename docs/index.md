---
layout: home

hero:
  name: MiSub
  text: 订阅聚合、算子管道与多客户端转换文档
  tagline: 运行于 Cloudflare Workers / Pages + D1，为人类开发者与 AI Agent 提供双重友好的工程与使用指南
  actions:
    - theme: brand
      text: 快速开始与部署
      link: /guide/getting-started
    - theme: alt
      text: 整体架构与规范
      link: /architecture/overview

features:
  - title: 多协议解析与多客户端输出
    details: 基于统一节点中间表示 NodeIR 与 7 套按需懒加载适配器，支持 Clash/Mihomo、Sing-Box、Surge、Loon、Quantumult X、Egern 与 Shadowrocket。
  - title: 流式算子链与安全表达式 DSL
    details: 支持 filter、rename、dedup、sort 与受限声明式 script 算子链，无 eval 风险，可精确控制节点筛选、地区重命名与协议优先级去重。
  - title: 纯 D1 八表存储与三级缓存
    details: 围绕 Cloudflare D1（MISUB_DB）构建八表行级存储，并通过 Memory -> Cloudflare Cache API -> D1 三级缓存与 Single-Flight 合并降低边缘读写成本。
  - title: AI Agent 原生友好
    details: 文档构建时通过 vitepress-plugin-llms 自动产出 /llms.txt、/llms-full.txt 及每个页面的纯文本 .md 镜像，方便编码助手直接检索与对齐项目规范。
---
