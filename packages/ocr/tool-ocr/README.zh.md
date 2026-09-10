# @deepseek-ai/dsh-tool-ocr

[English](README.md) | 中文

面向模型的 `ocr_image` 工具：对图片文件运行本地安装的 Tesseract 二进制，返回提取出的文本。

## 功能

在 `ctx.tools` 上注册一个工具 `ocr_image(file_path, language?, psm?)`。它通过 `ctx.fs` 解析目标（会话工作目录、存在性与常规文件校验、`fs/observed` 事件），然后执行 `tesseract <解析路径> stdout -l <语言> [--psm <n>]` 并返回纯文本形式的 `{ text, language }`。由于结果是文本，该工具可在适配器声明仅文本输入的模型路由上工作——这正是多模态 `read_image` 工具在这些路由上无法服务的空白。

`language` 是 tesseract 语言代码，如 `eng` 或 `chi_sim`（也接受 `eng+chi_sim` 这类复合代码）。`psm` 是可选页面分割模式，取值 0 到 13。

## 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `binPath` | `/opt/homebrew/bin/tesseract` | tesseract 可执行文件的绝对路径。 |
| `defaultLanguage` | `eng` | 模型省略 `language` 时使用的语言。 |
| `timeoutMs` | `30000` | 子进程超时；声明为工具的协作预算。 |
| `maxOutputChars` | `200000` | 输出上限；更长的输出会截断并附加明确提示。 |

所有字段均可从 cordis.yml 覆盖——二进制位置与语言包是平台关注点，不是代码常量。

## 失败模式

- **文件缺失 / 非常规文件** —— 在任何子进程启动前即报错，与内置读取工具相同的 `fs/observed` 纪律。
- **二进制缺失** —— `ENOENT` 转为指明修复方式的消息：安装 tesseract 或设置 `binPath`。
- **tesseract 失败** —— 非零退出会带出（截断后的）进程 stderr 与图片路径。
- **非法参数** —— 格式错误的语言代码与越界的 `psm` 在任何文件系统操作前即被拒绝。

## 说明

- 工具声明 `isConcurrencySafe`：每次调用都是独立的只读 OS 进程。
- 取消是协作式的：`exec.signal` 转发给子进程，`timeoutMs` 声明为工具的协作超时预算。
- 本包不发布不变量伴生插件（No runtime invariant companion is published）：工具没有可对照的独立生命周期流，其输出形态由工具输出 schema 在分发时强制。
