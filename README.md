# 所往 SUOWANG

**人生主线驾驶舱。行有所往。**

SUOWANG 是一个 local-first 的单机工具，用稳定界面回答三件事：

- 我现在处于恢复、工作还是生活状态？
- 这个状态下，哪条阶段主线是 Current？
- 此刻优先处理哪一条 Todo？

它不依赖 AI，不把人生变成 KPI、RPG、项目管理器或聊天窗口。

## 运行

需要 Node 22 或更高版本。

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

## V0.1 已有能力

- 恢复 / 工作 / 生活三个永久状态，各自记忆 Current 和 Priority。
- 每状态最多三条进行中主线，支持槽位移动或交换。
- 主线原地创建和编辑；Todo 原地创建、编辑、完成、放弃、删除、重排和同状态改归属。
- Priority 自动接棒，切 Current 不制造历史。
- completed/abandoned 历史与历史主线复制。
- SQLite migration、每日备份、SQLite 完整导出、JSON 可读导出和整库恢复。
- 显示名称、本地头像与三个状态 cue。
- 2560×1440、1920×1080 桌面第一屏与 320px 窄屏布局。

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
