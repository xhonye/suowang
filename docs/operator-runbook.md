# SUOWANG 本地运维手册

## 首次安装

需要 Node 22 或更高版本。

```powershell
Set-Location -LiteralPath 'A:/2Workspace/Projects/suowang'
npm install
npm run install-shortcut
```

日常双击桌面 `SUOWANG` 或仓库根目录的 `SUOWANG.cmd`。入口会先检查健康状态；服务已运行时只打开页面，未运行时隐藏启动，不制造重复实例。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `SUOWANG_DATA_DIR` | 本机优先 `D:/5Data/suowang`，否则系统应用数据目录 | 必须是绝对路径；保存数据库、备份、头像和日志 |
| `SUOWANG_PORT` | `2037` | 本地开发服务端口，范围 1–65535 |

桌面启动器按固定日常地址 `http://127.0.0.1:2037/` 工作。若临时改端口，应从命令行启动和访问，不要把它当成已更新的桌面入口。

## 冒烟检查

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:2037/health'
```

正常返回包含：

```json
{"status":"ok","app":"suowang","version":"0.1.0","database":"ready"}
```

默认正式数据库为 `D:/5Data/suowang/suowang.db`。不要手工编辑、复制运行中的数据库或把它放进仓库；使用设置页的 SQLite 导出取得一致性副本。

## 备份与恢复

- 每天第一次启动自动备份，位于数据目录的 `backups/`，滚动保留 30 份。
- 设置页的“导出 SQLite”生成可恢复完整备份；“导出 JSON”只用于阅读，不可恢复。
- 整库恢复会验证来源文件、先备份当前库，再整体替换；不会 merge。
- 恢复前确认选择的是 SUOWANG SQLite 导出，并避免同时打开多个手工启动的服务进程。

## 故障定位

双击入口失败时，错误窗口会给出阶段、原因、退出码、日志位置和下一步。启动日志在数据目录的 `logs/`。

按下面顺序检查：

1. Node 版本是否满足 `node --version` ≥ 22。
2. `http://127.0.0.1:2037/health` 是否返回正常状态。
3. 2037 端口是否被其他程序占用。
4. 数据目录是否可写，数据库或备份盘是否有空间。
5. 在仓库根目录运行 `npm run check`，确认代码与测试未损坏。

若健康检查正常但页面未更新，关闭旧的 SUOWANG Node 进程后重新双击入口。只终止命令行明确指向本仓库 `scripts/serve.mjs` 的进程，不按端口号盲目结束进程。

## 发布前检查

```powershell
Set-Location -LiteralPath 'A:/2Workspace/Projects/suowang'
npm run check
git diff --check
git status --short
```

确认 Git 中没有 `.db`、`.sqlite`、备份、日志、头像、导出或个人主线/Todo 内容。
