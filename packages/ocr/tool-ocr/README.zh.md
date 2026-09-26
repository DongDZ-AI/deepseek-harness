---
description: "基于本地 Tesseract 的 OCR 工具：从图片文件提取文字并返回纯文本，供模型直接消费。"
kind: "package-reference"
---
# @deepseek-ai/dsh-tool-ocr

[English](README.md) | 中文

<a id="summary"></a>
## 概述

面向模型的 `ocr_image` 工具：对图片文件运行本地安装的 Tesseract 二进制，返回提取出的文本。

## 目录

- [概述](#summary)
- [功能](#what-it-does)
- [配置](#configuration)
- [失败模式](#failure-modes)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="what-it-does"></a>
## 功能

在 `ctx.tools` 上注册一个工具 `ocr_image(file_path, language?, psm?)`。它通过 `ctx.fs` 解析目标（会话工作目录、存在性与常规文件校验、`fs/observed` 事件），然后执行 `tesseract <解析路径> stdout -l <语言> [--psm <n>]` 并返回纯文本形式的 `{ text, language }`。由于结果是文本，该工具可在适配器声明仅文本输入的模型路由上工作——这正是多模态 `read_image` 工具在这些路由上无法服务的空白。

`language` 是 tesseract 语言代码，如 `eng` 或 `chi_sim`（也接受 `eng+chi_sim` 这类复合代码）。`psm` 是可选页面分割模式，取值 0 到 13。

<a id="configuration"></a>
## 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `binPath` | `/opt/homebrew/bin/tesseract` | tesseract 可执行文件的绝对路径。 |
| `defaultLanguage` | `eng` | 模型省略 `language` 时使用的语言。 |
| `timeoutMs` | `30000` | 子进程超时；声明为工具的协作预算。 |
| `maxOutputChars` | `200000` | 输出上限；更长的输出会截断并附加明确提示。 |

所有字段均可从 cordis.yml 覆盖——二进制位置与语言包是平台关注点，不是代码常量。

<a id="failure-modes"></a>
## 失败模式

- **文件缺失 / 非常规文件** —— 在任何子进程启动前即报错，与内置读取工具相同的 `fs/observed` 纪律。
- **二进制缺失** —— `ENOENT` 转为指明修复方式的消息：安装 tesseract 或设置 `binPath`。
- **tesseract 失败** —— 非零退出会带出（截断后的）进程 stderr 与图片路径。
- **非法参数** —— 格式错误的语言代码与越界的 `psm` 在任何文件系统操作前即被拒绝。

<a id="model-experience"></a>
## 模型体验

### ocr_image

#### 模型看到什么

[工具目录](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-ocr) 中受门禁约束的 `ocr_image` schema 必填 `file_path`，可选 `language` 与 `psm`；返回值就是提取出的文字本身，而不是结构化对象。在纯文本路由上，这是读图的途径，且返回字符而非描述。

#### Token 影响

每个挂载的 agent 一份工具 schema。每次调用追加提取出的文字，受 `maxOutputChars`（默认 200000）约束并附明确截断提示，密集扫描不会静默吃满上下文。

#### KV Cache 影响

工具 schema 作为稳定前缀贡献；每次调用的输出追加在缓存前缀之后，不改写前缀。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **依赖外部二进制** —— 工具通过本地安装的 `tesseract` 执行；二进制缺失或 `binPath` 解析不到时直接失败，不退回其它 OCR 通路。
- **语种覆盖取决于已安装的语言包** —— Tesseract 没有对应数据的语言代码由 Tesseract 在运行时拒绝，不由本工具的校验拒绝。
- **只返回整图文本** —— 不返回区域、坐标或版面结构；`psm` 是唯一的版面控制手段。

<a id="dev-note"></a>
### 开发备注

- 工具声明 `isConcurrencySafe`：每次调用都是独立的只读 OS 进程。
- 取消是协作式的：`exec.signal` 转发给子进程，`timeoutMs` 声明为工具的协作超时预算。
- 本包不发布不变量伴生插件（No runtime invariant companion is published）：工具没有可对照的独立生命周期流，其输出形态由工具输出 schema 在分发时强制。
