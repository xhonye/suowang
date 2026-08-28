# SUOWANG 本地接口速查

这些端点供仓库内浏览器界面和自动化测试使用，不是公网或跨应用集成合同。默认基础地址为 `http://127.0.0.1:2037`；可选 Tailscale 地址只用于同一 Tailnet 内的 SUOWANG 页面，不扩大 API 集成承诺。

## 请求规则

- 普通写操作发送 `Content-Type: application/json`。
- SQLite 恢复直接发送数据库字节，最大 250 MiB。
- 头像上传发送 `image/png`、`image/jpeg` 或 `image/webp`，最大 5 MiB。
- 服务默认只接受本机 Host；显式启用 Tailscale 模式时额外接受自动发现的精确 Tailscale IP。浏览器请求的 Origin 必须与 Host 同源。

成功的业务写操作返回最新 snapshot。错误统一为：

```json
{
  "error": {
    "code": "stable_machine_code",
    "message": "可直接显示的中文说明",
    "details": null
  }
}
```

## 读取与设置

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/health` | 服务与数据库健康检查 |
| `GET` | `/api/snapshot` | 获取完整渲染快照 |
| `PATCH` | `/api/app-state` | 保存 `lastViewedStateId` |
| `PATCH` | `/api/settings` | 更新 `displayName` |
| `PATCH` | `/api/states/:stateId` | 更新模式 `cue`（路径为兼容保留） |

## 主线

| 方法 | 路径 | 用途 |
|---|---|---|
| `POST` | `/api/mainlines` | 创建主线 |
| `PATCH` | `/api/mainlines/:id` | 编辑 active 主线字段 |
| `DELETE` | `/api/mainlines/:id` | 确认后 hard delete；请求体说明事项处理 |
| `POST` | `/api/mainlines/:id/current` | 设为当前主线 |
| `POST` | `/api/mainlines/:id/slot` | 移动或交换槽位 |
| `POST` | `/api/mainlines/:id/end` | 完成或放弃并处理 active 事项 |
| `POST` | `/api/mainlines/:id/copy` | 从行迹复制新主线，不复制事项；同模式无同名 active 主线时可沿用原名称 |

## 事项（内部路径保留 `/api/todos`）

| 方法 | 路径 | 用途 |
|---|---|---|
| `POST` | `/api/todos` | 创建其他事项或主线事项；接收必填 `title`、可选 `minimalStep` 与 `kind: single/ongoing` |
| `PATCH` | `/api/todos/:id` | 编辑 active 事项的 `title`、`minimalStep`；一次事项可改为 `ongoing`，持续事项不能直接降回一次事项 |
| `DELETE` | `/api/todos/:id` | 确认后 hard delete |
| `POST` | `/api/todos/:id/complete` | 完成事项 |
| `POST` | `/api/todos/:id/abandon` | 放弃事项 |
| `POST` | `/api/todos/:id/reopen` | 撤回行迹事项；原主线已结束时回到同模式其他事项 |
| `POST` | `/api/todos/:id/record` | 为持续事项记录今天完成；同一本地自然日最多一次 |
| `POST` | `/api/todos/:id/undo-record` | 撤回持续事项今天的完成记录 |
| `POST` | `/api/todos/:id/move` | 同模式移动、改归属和重排 |
| `POST` | `/api/todos/:id/priority` | 设为当前模式的下一步 |

持续事项始终保持 active，直到显式调用 `complete`（达成并结束）或 `abandon`（不再继续）。Snapshot 中每条事项包含 `kind`、`completionCount` 和 `completedToday`；当天已完成的持续事项不会成为下一步补位候选。JSON 导出包含 `todoOccurrences`，SQLite 导出仍是唯一可恢复格式。

## 文件

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/export/json` | 下载只读 JSON 导出 |
| `GET` | `/api/export/sqlite` | 下载可恢复的完整 SQLite 备份 |
| `POST` | `/api/import/sqlite` | 验证并覆盖恢复整库 |
| `GET` | `/api/avatar` | 读取本地头像 |
| `POST` | `/api/avatar` | 写入本地头像并更新设置 |

## 快速检查

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:2037/health'
Invoke-RestMethod -Uri 'http://127.0.0.1:2037/api/snapshot'
```

开发新交互时优先扩展 `SuowangService` 并留下事务测试，再把已有业务动作暴露为 HTTP 端点。不要让前端直接拼 SQL 或维护平行状态机。
