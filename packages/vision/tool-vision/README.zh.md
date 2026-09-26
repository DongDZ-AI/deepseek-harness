---
description: "MiniMax VLM 视觉理解工具：通过本地 `mmx` CLI 描述图片或回答关于图片的问题，用于不能直投原生 image block 的文本路由。"
kind: "package-reference"
---
# @deepseek-ai/dsh-tool-vision

[English](README.md) | 中文

<a id="summary"></a>
## 概述

面向模型的 `vision_describe` 工具：包装本地 MiniMax VLM CLI（`mmx vision describe`），为声明纯文本输入的模型路由提供完整的图片理解能力——这是多模态 `read_image` 工具在文本路由上无法覆盖的缺口。

## 目录

- [概述](#summary)
- [功能](#what-it-does)
- [配置](#configuration)
- [挂载](#mount)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="what-it-does"></a>
## 功能

在 `ctx.tools` 上注册一个工具：`vision_describe(file_path, prompt?)`。它通过 `ctx.fs` 解析目标（会话 cwd、存在性与常规文件校验、`fs/observed` 事件），然后执行 `mmx vision describe --image <解析路径> --prompt <文本>`，返回 `{ content }`——从 mmx 的 JSON 信封中提取的 VLM 描述。

与 `ocr_image`（纯文字提取）互补：需要理解图片的布局、物体、场景时用 `vision_describe`。

<a id="configuration"></a>
## 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `binPath` | `mmx` | mmx 可执行名（从 PATH 解析）或绝对路径。 |
| `defaultPrompt` | `Describe the image in detail.` | 模型省略 `prompt` 时使用的提问。 |
| `timeoutMs` | `120000` | 子进程超时；作为工具的协作预算声明。 |
| `maxOutputChars` | `40000` | 输出上限；超长输出截断并附显式提示。 |

<a id="mount"></a>
## 挂载

在 profile 的 `cordis.patch.yml` 加一行：

```yaml
- insert:
    - id: tool-vision
      name: '@deepseek-ai/dsh-tool-vision'
```

需要 `mmx` CLI（`mmx vision describe`）已安装且在 PATH 上。

<a id="model-experience"></a>
## 模型体验

### vision_describe

#### 模型看到什么

[工具目录](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-vision) 中受门禁约束的 `vision_describe` schema 必填 `file_path`，可选 `prompt`；返回值是 VLM 的描述文本。它在 `ocr_image` 只返回字符之外，回答布局、物体与场景层面的问题。

#### Token 影响

每个挂载的 agent 一份工具 schema。每次调用追加提取出的文字，受 `maxOutputChars`（默认 40000）约束并附明确截断提示；图片字节不进入模型消息。

#### KV Cache 影响

工具 schema 作为稳定前缀贡献；每次调用的输出追加在缓存前缀之后，不改写前缀。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **依赖外部 CLI** —— 工具通过 `mmx vision describe` 执行；CLI 缺失或 mmx 身份未登录时直接失败，不降级到其它通路。
- **延迟由服务端决定** —— 单次调用可能吃满 `timeoutMs`（默认 120 秒）；它是工具的协作预算，不是产品限制。
- **只返回描述** —— 不返回包围框或逐字文本；需要精确字符时与 `ocr_image` 配合。

<a id="dev-note"></a>
### 开发备注

- 本包不发布不变量伴生插件（No runtime invariant companion is published）：工具没有可对照的独立生命周期流；其输出是受配置字符上限约束的 VLM 描述。
