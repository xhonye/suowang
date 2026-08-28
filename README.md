# 所往 SUOWANG

> **行有所往。**

> **知所往 · 择其径 · 行其事。**

> **人生是一场无限游戏，但我们总需要一条当前主线。**

**人生主线驾驶舱 / Mainline Cockpit**

**充分参与这一次人生。**

所往帮助人在认知余量不足时，仍能快速回答四个问题：

1. 我现在处于什么模式？
2. 我当前主要往哪里走？
3. 我现在具体做什么？
4. 如果知道要做却启动不了，怎样把第一步降到足够简单？

它不是 Todo List、习惯打卡器、完整人生决策系统、项目管理器、KPI 仪表盘、RPG 或 AI 聊天窗口。它把恢复、工作、生活三个模式，各自的阶段主线、下一步和最小一步，编排成位置稳定、可以长期形成空间记忆的界面。

## 为什么是主线

人生没有需要一次完成的固定终局，但此刻应该有所往。

主线是有限、可结束的阶段使命。一个模式可以保留几条正在推进的主线，但同一时刻只选择一条当前主线。结束一条主线不等于人生通关，切换主线也不抹掉走过的路。

> AI 用来造驾驶舱，不用来当驾驶员。把 token 编译成稳定界面，而不是把人生反复编译成回答。

## 项目起因

![所往项目起因的早期反馈，身份信息已经脱敏](docs/assets/origin-feedback-redacted.png)

## 早期概念图

![所往人生主线页面早期概念图](docs/assets/early-mainline-concept.png)

> 这张图记录了所往最初的产品方向，不是当前界面截图。图中的品牌占位、Timeline、NOW 和部分功能已经被后续产品合同替换；保留它是为了说明项目从哪里出发。

## 产品机制

```text
知模式
  ↓
择主线
  ↓
行下一步
  ↓
现实变化
  ↓
重新知模式
```

- **知所往**：先确认此刻处于恢复、工作还是生活模式。
- **择其径**：在这个模式的阶段主线中，明确当前主线。
- **行其事**：看清下一步；启动困难时，再把它降成足够简单的最小一步。

道路是所往的主视觉，也是三个模式的直接入口。切换模式后，每个模式会恢复自己的当前主线和下一步；系统不自动替用户决定方向，也不按日期擅自重排。

## 产品原则

- **稳定界面，动态内容**：让人形成空间记忆，不必每次重新理解 UI。
- **主线意味着取舍**：可以保留多条进行中主线，但当前主线必须表达此刻的主要方向。
- **下一步必须清楚**：下一步是注意力指针，不是新的事项状态或工作计时器。
- **启动入口足够低**：事项可写一个非必填的最小一步，帮助知道要做却难以开始的人先迈出去。
- **持续不等于打卡**：需要反复行动的事项可以每天记录一次并查看累计次数，但没有连续天数、缺卡惩罚、提醒或积分。
- **行迹尊重事实**：主线完成和放弃后只能复制为新主线；事项允许撤回，以纠正误点完成或放弃。
- **本地事实优先**：SQLite 是业务数据唯一真源，主线与事项不进入云端，也不依赖运行时 AI。
- **AI 退居幕后**：核心功能完全不依赖 LLM，默认界面没有聊天框。

> 当用户认知能力只剩 30% 时，这个页面仍然必须很好用。

## 当前已有能力

- 恢复 / 工作 / 生活三个永久模式，各自记忆当前主线和下一步。
- 每个模式最多三条进行中主线，支持槽位移动或交换。
- 主线原地创建和编辑；事项支持名称、可选最小一步、完成、放弃、删除、重排和同模式改归属。
- 一次事项完成后进入行迹；持续事项每天最多记录一次，保留累计次数，并可撤回当天记录或明确结束。
- 下一步自动接棒，切当前主线不制造行迹。
- completed/abandoned 行迹、事项撤回与行迹主线复制。
- SQLite migration、每日备份、SQLite 完整导出、JSON 可读导出和整库恢复。
- 显示名称、本地头像与三个模式 cue。
- 2560×1440、1920×1080 桌面第一屏与 320px 窄屏布局。

## 安装与运行

### Windows 普通用户（推荐）

从 GitHub Release 下载 `SUOWANG-Setup-*.exe`：双击安装，随后从桌面「所往 SUOWANG」图标打开即可。它自带运行环境，不需要安装 Node.js、npm 或使用命令行。

如果你不想安装，可下载 `SUOWANG-Portable-*.zip`，解压后双击 `SUOWANG.cmd`。请只从官方 Release 下载；首次运行新版本时，Windows 可能会要求确认。

### macOS（Apple Silicon，0.1.2 起）

适用于 M1 及以后芯片的 Mac。从 GitHub Release 下载 `SUOWANG-*-mac-arm64.dmg`，打开后将「所往 SUOWANG」拖入 Applications（应用程序），然后双击打开。它自带运行环境，会自动打开浏览器，不需要安装 Node.js、npm 或使用终端。

首个未签名测试版首次打开时，macOS 可能会提示未知开发者：按住 Control 点击「所往 SUOWANG」并选择“打开”，再确认一次即可。

### 开发者与源码使用

源码运行、`npm install --global` 安装与现有的 `INSTALL.cmd` 需要 Node 22 或更高版本。

### 交给本地 Agent

把下面一句发给能使用终端的本地 Agent：

> 请安装已确认版本的 SUOWANG：若该版本已发布到 npm，先用 `npm view suowang@<version> version` 核对后运行 `npm install --global suowang@<version>`；若你有 GitHub 仓库权限，则运行 `npm install --global github:xhonye/suowang#v<version>`。在 Windows 运行 `suowang install-shortcut`，验证 `http://127.0.0.1:2037/health` 正常并打开 SUOWANG。不要读取、移动或覆盖已有的 `SUOWANG_DATA_DIR` 数据，也不要退回安装会漂移的最新 `main`。

安装为全局 npm 命令后也可以直接运行：

```powershell
suowang
suowang install-shortcut
suowang --help
```

### 从源码运行

```powershell
Set-Location -LiteralPath 'A:/2Workspace/Projects/suowang'
npm install
npm start
```

浏览器打开 `http://127.0.0.1:2037/`。

Windows 日常使用可以直接双击 `SUOWANG.cmd`。安装桌面快捷方式：

```powershell
npm run install-shortcut
```

以后双击桌面的 `SUOWANG`：已运行则直接打开，未运行则隐藏启动本地服务后打开浏览器。

### 手机通过 Tailscale 访问（可选）

电脑和手机安装并登录同一个 Tailscale 后，在电脑运行：

```powershell
suowang access tailscale
```

然后再次双击桌面 `SUOWANG`。命令会显示类似 `http://100.x.x.x:2037/` 的手机地址。该模式仍保留电脑本机入口，并且只额外监听本机 Tailscale 地址，不监听普通局域网或公网。SUOWANG 目前没有应用级账号认证，因此只应允许你信任的 Tailnet 设备访问；恢复仅本机模式运行 `suowang access local` 后再次启动。

访问开关保存在仓库外的数据目录 `access.json`，个人 Tailscale IP 只在启动时自动发现，不写入项目文件，也不需要提交 `.env`。开源仓库只包含通用的可选能力。

## 数据位置

业务数据不会写进仓库。

1. 设置 `SUOWANG_DATA_DIR` 时使用该绝对路径。
2. Windows 新安装使用 `%LOCALAPPDATA%/SUOWANG`。
3. Windows 旧版本若已经存在 `D:/5Data/suowang/suowang.db`，继续使用该旧目录，不自动搬迁。
4. 标准目录与旧目录同时存在数据库时，SUOWANG 会停止并要求用 `SUOWANG_DATA_DIR` 明确选择，不擅自合并。
5. macOS 使用 `~/Library/Application Support/SUOWANG/`；Linux 使用 `$XDG_DATA_HOME/suowang` 或 `~/.local/share/suowang`。

目录内包含 SQLite 数据库、每日备份、本地头像、访问配置和启动日志。正式库首次启动显示中性的“所往用户”，没有 demo 主线、事项或假统计。自动备份位于同一设备，不等于异地灾备。

## 验证

```powershell
npm test
npm run check
npm run release:check
```

测试全部使用临时数据库，不读取或修改个人运行数据。

## 文档

- [产品模型](docs/product-brief.md)
- [视觉合同](docs/visual-contract.md)
- [架构与数据流](docs/architecture.md)
- [本地接口速查](docs/integration-guide.md)
- [启动、备份与故障处理](docs/operator-runbook.md)
- [V0.1 实施交接](docs/handoff.md)
- [版本记录](CHANGELOG.md)

## 技术边界

Vanilla JS + CSS + Node + `better-sqlite3`。无 React、Vue、Tailwind、ORM、Electron、Tauri、账号、云同步、遥测或运行时 LLM。

## 开源与许可证

本项目使用 [Apache License 2.0](LICENSE)。
