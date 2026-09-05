# GPT View+ v0.5.21

::: {align="right"}
[简体中文](#简体中文) \| [English](#english)
:::

------------------------------------------------------------------------

# 简体中文

## 项目简介

GPT View+ 是一个面向 ChatGPT
用户的浏览器扩展，目标是提升长对话阅读、整理和工作效率。

它通过增强 ChatGPT
网页体验，提供更适合知识工作场景的阅读布局、长对话管理和内容导出能力。

## 核心功能

### 阅读体验增强

-   自定义聊天页面宽度
-   阅读模式优化
-   背景与主题调整
-   字体大小与行高控制
-   代码自动换行

### 长对话管理

-   长聊天导航
-   快速定位历史内容
-   自动扫描完整对话内容

### 内容导出

支持：

-   Markdown 导出
-   TXT 导出
-   PDF 打印

用于：

-   知识整理
-   项目文档沉淀
-   AI 对话归档

### 用户界面国际化

支持：

-   简体中文
-   English

语言资源：

    _locales/
    ├── en/
    │   └── messages.json
    └── zh_CN/
        └── messages.json

扩展可以根据浏览器语言环境加载对应文本。

## 技术结构

    GPT View+
    │
    ├── manifest.json
    │
    ├── content.js
    │   └── ChatGPT 页面增强逻辑
    │
    ├── popup.html
    │   └── 设置界面
    │
    ├── popup.js
    │   └── 配置管理与交互逻辑
    │
    ├── popup.css
    │
    ├── _locales/
    │   ├── en/
    │   └── zh_CN/
    │
    └── assets/
        └── icons

## 安装方式

1.  下载扩展压缩包
2.  打开 Edge / Chrome 扩展管理页面
3.  开启开发者模式
4.  加载解压后的扩展目录

## 权限说明

当前权限：

    storage

访问范围：

    https://chatgpt.com/*

权限仅用于：

-   保存用户设置
-   增强 ChatGPT 页面体验

## 开发状态

当前版本：

    v0.5.21

已完成：

-   Manifest V3
-   国际化支持
-   中英文切换
-   长对话导航
-   内容导出能力
-   设置持久化

## 测试状态

测试报告：

    TEST_REPORT.md

包含：

-   Manifest 校验
-   JSON 检查
-   JavaScript 语法检查
-   国际化资源检查
-   ZIP 完整性检查

------------------------------------------------------------------------

# English

## Introduction

GPT View+ is a browser extension designed to improve the ChatGPT web
experience.

It focuses on better reading, organization, and productivity for long AI
conversations.

## Features

### Reading Enhancement

-   Adjustable chat width
-   Reading-friendly layout
-   Theme customization
-   Font size and line height control
-   Code wrapping support

### Long Conversation Management

-   Long-chat navigator
-   Quick history navigation
-   Full conversation scanning

### Export Tools

Supported formats:

-   Markdown
-   TXT
-   PDF

Use cases:

-   Knowledge management
-   Project documentation
-   AI conversation archiving

### Internationalization

Supported languages:

-   Simplified Chinese
-   English

Localization files:

    _locales/
    ├── en/
    │   └── messages.json
    └── zh_CN/
        └── messages.json

## Architecture

    GPT View+
    │
    ├── manifest.json
    ├── content.js
    ├── popup.html
    ├── popup.js
    ├── popup.css
    ├── _locales/
    └── assets/

## Installation

1.  Download the extension package.
2.  Open Edge / Chrome extension settings.
3.  Enable developer mode.
4.  Load the unpacked extension folder.

## Permissions

Current permissions:

    storage

Host permission:

    https://chatgpt.com/*

Used for:

-   Saving preferences
-   Enhancing the ChatGPT interface

## Development Status

Current version:

    v0.5.21

Completed:

-   Manifest V3 migration
-   Internationalization
-   Chinese / English switching
-   Long conversation navigation
-   Export features
-   Persistent settings

## Testing

See:

    TEST_REPORT.md

Includes:

-   Manifest validation
-   JSON validation
-   JavaScript syntax checks
-   Localization verification
-   ZIP integrity checks

------------------------------------------------------------------------

## License

Add your license information here.
