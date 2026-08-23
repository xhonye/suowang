# SUOWANG V0.1 架构

## 系统边界

SUOWANG 是只监听 loopback 的单机 Web 应用。浏览器负责显示和收集操作，Node 服务负责静态页面、JSON API、业务事务、文件导出与恢复，SQLite 是唯一正式业务真源。

```text
Browser UI
   │ same-origin HTTP
   ▼
scripts/serve.mjs
   │
   ├─ SuowangService：主线、Todo、Current、Priority 规则
   ├─ DatabaseRuntime：migration、备份、恢复
   └─ SQLite：仓库外 suowang.db
```

应用不连接云服务，不发送遥测，不在浏览器中保存主线、Todo 或指针。每次写操作返回最新 snapshot，前端不自行猜测事务结果。

## 数据模型

`migrations/001_init.sql` 创建四类核心表：

| 表 | 责任 | 关键约束 |
|---|---|---|
| `states` | 固定三状态及 cue、Current、Priority | 仅 `restore/work/life`；身份和顺序不可变 |
| `mainlines` | 阶段主线与槽位 | 状态不可变；每状态 active 槽位 1–3 唯一；名称全局归一化唯一 |
| `todos` | 主线 Todo 与状态 Todo | 状态不可变；归属主线必须同状态；作用域内持久排序 |
| `app_settings` | 显示名称、头像、上次状态 | 单行设置；上次状态必须引用固定状态 |

`current_mainline_id` 和 `priority_todo_id` 是指针。业务层在同一事务内完成指针更新、自动补位、槽位交换、Todo 重排和结束处理；数据库触发器再防止跨状态引用与系统状态变形。

## 目录与模块

- `src/server/config.mjs`：项目、数据目录和端口解析。
- `src/server/database.mjs`：migration、连接生命周期、每日备份、下载备份与整库恢复。
- `src/server/service.mjs`：全部业务规则和 snapshot 组装。
- `scripts/serve.mjs`：loopback HTTP 边界、静态文件、API、导出、恢复和头像。
- `src/api.js`：同源浏览器客户端。
- `src/view-model.js`：无 DOM 的显示规则。
- `src/app.js`：页面渲染与交互编排。

## Routes

内部 API 以 `GET /api/snapshot` 为读取入口；主线、Todo、设置和状态变更分别使用资源端点。`POST /api/todos/:id/reopen` 专门把历史 Todo 撤回为 active，并在原主线已结束时解除主线归属。完整方法表、请求类型和错误结构见 [integration-guide.md](integration-guide.md)。

服务默认只接受 `Host: 127.0.0.1` 或 `localhost`。显式启用 Tailscale 模式时，共享同一数据库与请求处理器的第二个 HTTP listener 只绑定自动发现的本机 Tailscale IPv4，并把该精确地址加入 Host 白名单；本机 listener 保持不变。服务从不绑定 `0.0.0.0`。带 `Origin` 的请求必须与 Host 同源；JSON 变更请求必须使用 `application/json`。静态服务只暴露页面所需的前端文件与道路图片，不映射后端源码、仓库配置或 Git 元数据。这些边界用于阻止其他网页借浏览器访问数据；Tailscale 模式依赖 Tailnet ACL，不代表应用具备账号认证或公网接口。

## 数据生命周期

1. 启动时按文件名顺序执行未运行的 migration。
2. 当天首次启动前创建一致性 SQLite 备份，自动备份滚动保留 30 份。
3. 手动 SQLite 导出使用数据库备份 API 创建一致性快照；JSON 导出只用于人类阅读。
4. 整库恢复先验证文件结构，再备份当前库，关闭连接并原子替换；失败时恢复安全副本。
5. 正式数据、备份、头像、日志和临时导出始终位于仓库外。

## 取舍

- 使用原生 Node HTTP 和 Vanilla JS，保持本地应用依赖面小。
- 使用同步 SQLite 驱动，把单用户短事务写成清楚的原子操作。
- 不建立 audit/event 流水；主线结束后保持历史事实，Todo 可从历史撤回为 active 以纠正误操作。
- 不做 JSON 恢复或数据 merge，避免产生两套真源和模糊冲突规则。
