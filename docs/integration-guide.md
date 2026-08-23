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
| `PATCH` | `/api/states/:stateId` | 更新状态 `cue` |

## 主线

| 方法 | 路径 | 用途 |
|---|---|---|
| `POST` | `/api/mainlines` | 创建主线 |
| `PATCH` | `/api/mainlines/:id` | 编辑 active 主线字段 |
| `DELETE` | `/api/mainlines/:id` | 确认后 hard delete；请求体说明 Todo 处理 |
| `POST` | `/api/mainlines/:id/current` | 设为 Current |
| `POST` | `/api/mainlines/:id/slot` | 移动或交换槽位 |
| `POST` | `/api/mainlines/:id/end` | 完成或放弃并处理 active Todo |
| `POST` | `/api/mainlines/:id/copy` | 从历史复制新主线，不复制 Todo |

## Todo

| 方法 | 路径 | 用途 |
|---|---|---|
| `POST` | `/api/todos` | 创建状态或主线 Todo |
| `PATCH` | `/api/todos/:id` | 编辑 active Todo 标题 |
| `DELETE` | `/api/todos/:id` | 确认后 hard delete |
| `POST` | `/api/todos/:id/complete` | 完成 Todo |
| `POST` | `/api/todos/:id/abandon` | 放弃 Todo |
| `POST` | `/api/todos/:id/reopen` | 撤回历史 Todo；原主线已结束时回到状态通用 Todo |
| `POST` | `/api/todos/:id/move` | 同状态移动、改归属和重排 |
| `POST` | `/api/todos/:id/priority` | 设为当前状态 Priority |

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
