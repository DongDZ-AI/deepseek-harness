---
description: "MiniMax VLM 视觉理解工具：通过本地 `mmx` CLI 描述图片或回答关于图片的问题，用于不能直投原生 image block 的文本路由。"
kind: "package-reference"
---
# @deepseek-ai/dsh-tool-vision

[English](README.md) | 中文

## 概述

面向模型的 `vision_describe` 工具：包装本地 MiniMax VLM CLI（`mmx vision describe`），为声明纯文本输入的模型路由提供完整的图片理解能力——这是多模态 `read_image` 工具在文本路由上无法覆盖的缺口。

## 目录

- [概述](#概述)
- [功能](#功能)
- [配置](#配置)
- [挂载](#挂载)
- [说明](#说明)

## 功能

在 `ctx.tools` 上注册一个工具：`vision_describe(file_path, prompt?)`。它通过 `ctx.fs` 解析目标（会话 cwd、存在性与常规文件校验、`fs/observed` 事件），然后执行 `mmx vision describe --image <解析路径> --prompt <文本>`，返回 `{ content }`——从 mmx 的 JSON 信封中提取的 VLM 描述。

与 `ocr_image`（纯文字提取）互补：需要理解图片的布局、物体、场景时用 `vision_describe`。

## 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `binPath` | `mmx` | mmx 可执行名（从 PATH 解析）或绝对路径。 |
| `defaultPrompt` | `Describe the image in detail.` | 模型省略 `prompt` 时使用的提问。 |
| `timeoutMs` | `120000` | 子进程超时；作为工具的协作预算声明。 |
| `maxOutputChars` | `40000` | 输出上限；超长输出截断并附显式提示。 |

## 挂载

在 profile 的 `cordis.patch.yml` 加一行：

```yaml
- insert:
    - id: tool-vision
      name: '@deepseek-ai/dsh-tool-vision'
```

需要 `mmx` CLI（`mmx vision describe`）已安装且在 PATH 上。

## 开发备注

- 本包不发布不变量伴生插件（No runtime invariant companion is published）：工具没有可对照的独立生命周期流；其输出是受配置字符上限约束的 VLM 描述。
