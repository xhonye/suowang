# 所往 SUOWANG

> **行有所往。**

> **人生是一场无限游戏，但我们总需要一条当前主线。**

**人生主线驾驶舱 / Mainline Cockpit**

**充分参与这一次人生。**

所往帮助人在认知余量不足时，仍能快速回答三个问题：

1. 我现在处于什么状态？
2. 我当前主要往哪里走？
3. 接下来优先做什么？

它不是 Todo List、完整人生决策系统、项目管理器、KPI 仪表盘、RPG 或 AI 聊天窗口。它把恢复、工作、生活三个状态，各自的阶段主线和眼前一步，编排成位置稳定、可以长期形成空间记忆的界面。

## 为什么是主线

人生没有需要一次完成的固定终局，但此刻应该有所往。

主线是有限、可结束的阶段使命。一个状态可以保留几条正在推进的主线，但同一时刻只把一条放在 Current 位置。结束一条主线不等于人生通关，切换主线也不抹掉走过的路。

> AI 用来造驾驶舱，不用来当驾驶员。把 token 编译成稳定界面，而不是把人生反复编译成回答。

## 项目起因

![所往项目起因的早期反馈，身份信息已经脱敏](docs/assets/origin-feedback-redacted.png)

## 早期概念图

![所往人生主线页面早期概念图](docs/assets/early-mainline-concept.png)

> 这张图记录了所往最初的产品方向，不是当前界面截图。图中的品牌占位、Timeline、NOW 和部分功能已经被后续产品合同替换；保留它是为了说明项目从哪里出发。

## 产品机制

```text
知状态
  ↓
择主线
  ↓
行下一步
  ↓
现实变化
  ↓
重新知状态
```

- **知所往**：先确认此刻处于恢复、工作还是生活状态。
- **择其径**：在这个状态的阶段主线中，明确当前主要推进哪一条。
- **行其事**：把注意力落到一条 Priority Todo，知道下一步从哪里开始。

道路是所往的主视觉，也是三个状态的直接入口。切换状态后，每个状态会恢复自己的 Current 主线和 Priority；系统不自动替用户决定方向，也不按日期擅自重排。

## 产品原则

- **稳定界面，动态内容**：让人形成空间记忆，不必每次重新理解 UI。
- **主线意味着取舍**：可以保留多条进行中主线，但 Current 必须表达此刻的主要方向。
- **下一步必须清楚**：Priority 是注意力指针，不是新的任务状态或工作计时器。
- **历史尊重事实**：完成和放弃都被保留；重新开始意味着创建一条新的主线。
- **本地事实优先**：SQLite 是业务数据唯一真源，主线与 Todo 不进入云端，也不依赖运行时 AI。
- **AI 退居幕后**：核心功能完全不依赖 LLM，默认界面没有聊天框。

> 当用户认知能力只剩 30% 时，这个页面仍然必须很好用。

## V0.1 已有能力

- 恢复 / 工作 / 生活三个永久状态，各自记忆 Current 和 Priority。
- 每状态最多三条进行中主线，支持槽位移动或交换。
- 主线原地创建和编辑；Todo 原地创建、编辑、完成、放弃、删除、重排和同状态改归属。
- Priority 自动接棒，切 Current 不制造历史。
- completed/abandoned 历史与历史主线复制。
- SQLite migration、每日备份、SQLite 完整导出、JSON 可读导出和整库恢复。
- 显示名称、本地头像与三个状态 cue。
- 2560×1440、1920×1080 桌面第一屏与 320px 窄屏布局。

## 运行

需要 Node 22 或更高版本。

交给本地 Agent 安装时，直接发送：`请从 https://github.com/xhonye/suowang 克隆最新 main，检查 Node.js 22+，运行 npm install 和 npm run install-shortcut，启动后验证 http://127.0.0.1:2037/health 正常并打开 SUOWANG；不要读取、移动或覆盖已有的 SUOWANG_DATA_DIR 数据。`

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

## 数据位置

业务数据不会写进仓库。

1. 设置 `SUOWANG_DATA_DIR` 时使用该绝对路径。
2. 当前 Windows 机器存在 `D:/5Data` 时使用 `D:/5Data/suowang`。
3. 其他 Windows 机器使用 `%LOCALAPPDATA%/SUOWANG`。

目录内包含 SQLite 数据库、每日备份、本地头像和启动日志。正式库首次启动没有 demo 主线、Todo 或假统计。

## 验证

```powershell
npm test
npm run check
```

测试全部使用临时数据库，不读取或修改个人运行数据。

## 文档

- [产品模型](docs/product-brief.md)
- [视觉合同](docs/visual-contract.md)
- [架构与数据流](docs/architecture.md)
- [本地接口速查](docs/integration-guide.md)
- [启动、备份与故障处理](docs/operator-runbook.md)
- [V0.1 实施交接](docs/handoff.md)

## 技术边界

Vanilla JS + CSS + Node + `better-sqlite3`。无 React、Vue、Tailwind、ORM、Electron、Tauri、账号、云同步、遥测或运行时 LLM。

## 开源与许可证

本项目使用 [Apache License 2.0](LICENSE)。
