import { defineConfig } from 'vitepress';
import llmstxt from 'vitepress-plugin-llms';

export default defineConfig({
  lang: 'zh-CN',
  title: 'MiSub',
  description: '轻量级代理订阅聚合与多客户端转换平台（面向人类与 AI Agent 双重友好文档）',
  cleanUrls: true,

  vite: {
    plugins: [
      llmstxt({
        generateLLMsTxt: true,
        generateLLMsFullTxt: true,
        generateLLMFriendlyDocsForEachPage: true,
        stripHTML: true,
        injectLLMHint: true,
      }),
    ],
  },

  themeConfig: {
    search: {
      provider: 'local',
      options: {
        translations: {
          button: {
            buttonText: '搜索文档',
            buttonAriaLabel: '搜索文档',
          },
          modal: {
            noResultsText: '无法找到相关结果',
            resetButtonTitle: '清除查询条件',
            footer: {
              selectText: '选择',
              navigateText: '切换',
              closeText: '关闭',
            },
          },
        },
      },
    },

    nav: [
      { text: '首页', link: '/' },
      { text: '使用指南', link: '/guide/getting-started' },
      { text: 'API 参考', link: '/api/external-api' },
      { text: '架构与开发', link: '/architecture/overview' },
    ],

    sidebar: [
      {
        text: '使用指南',
        items: [
          { text: '快速开始与部署', link: '/guide/getting-started' },
          { text: '节点、订阅与订阅组管理', link: '/guide/nodes-and-profiles' },
          { text: '多协议支持与客户端兼容矩阵', link: '/guide/protocols-and-compatibility' },
          { text: '订阅聚合与算子管道', link: '/guide/subscription-and-operators' },
          { text: '算子与安全 DSL 实战配方库', link: '/guide/dsl-cookbook' },
          { text: '规则模板、DNS 与链式代理', link: '/guide/templates-and-rules' },
          { text: '公开分享页、短链与安全防护', link: '/guide/public-page-and-security' },
          { text: 'WebDAV 备份与 Telegram Bot', link: '/guide/webdav-and-telegram' },
          { text: 'GitHub 加速代理、访问日志与错误监控', link: '/guide/github-proxy-and-observability' },
          { text: '常见问题与排错指南', link: '/guide/faq-and-troubleshooting' },
        ],
      },
      {
        text: 'API 参考',
        items: [{ text: '对外开放 API (v1)', link: '/api/external-api' }],
      },
      {
        text: '架构与开发',
        items: [
          { text: '整体架构与核心机制', link: '/architecture/overview' },
          { text: 'D1 八表数据字典与存储设计', link: '/architecture/database-schema' },
          { text: '工程与 AI 开发规范', link: '/architecture/coding-standards' },
          { text: '测试架构与 AI 协作指南', link: '/architecture/testing-and-contributing' },
        ],
      },
    ],

    outline: {
      level: [2, 3],
      label: '页面导航',
    },

    docFooter: {
      prev: '上一页',
      next: '下一页',
    },

    lastUpdated: {
      text: '最后更新于',
    },
  },
});
