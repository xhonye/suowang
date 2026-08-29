# SUOWANG 0.2 beta 架构

## 系统边界

SUOWANG 是默认只监听 loopback、可显式启用受限 Tailscale 访问的本地优先 Web 应用。浏览器负责显示和收集操作，Node 服务负责静态页面、JSON API、业务事务、文件导出与恢复，SQLite 是唯一正式业务真源。

```text
Browser UI
   │ same-origin HTTP
   ▼
scripts/serve.mjs
   │
   ├─ SuowangService：模式、主线、事项、当前主线、下一步规则
   ├─ DatabaseRuntime：migration、备份、恢复
   └─ SQLite：仓库外 suowang.db
```

应用不连接云服务，不发送遥测，不在浏览器中保存主线、事项或指针。每次写操作返回最新 snapshot，前端不自行猜测事务结果。

## 数据模型

`migrations/001_init.sql` 创建核心表，后续 migration 无损增加最小一步、默认提示语、持续事项、行动中指针和工作区空间。`007_rekey_mainline_names.sql` 将 active 主线内部名称键限定到模式，并把行迹键改为 ID。`004_add_ongoing_todos.sql` 给事项增加 `kind`，并创建按自然日保存完成事实的 `todo_occurrences`：

| 表 | 责任 | 关键约束 |
|---|---|---|
| `states` | 固定三模式及 cue、当前主线、下一步 | 仅 `restore/work/life`；身份和顺序不可变 |
| `mainlines` | 阶段主线与槽位 | 模式不可变；每模式 active 槽位 1–3 唯一；同模式 active 规范化名称唯一 |
| `todos` | 主线事项与其他事项 | 模式不可变；归属主线必须同模式；`title` 必填、`minimal_step` 可空；`kind` 仅为 `single/ongoing`；作用域内持久排序 |
| `todo_occurrences` | 持续事项的实际完成事实 | 每条记录属于一个事项；`todo_id + completed_on` 唯一，保证每个本地自然日最多一次；删除事项时级联删除 |
| `app_settings` | 显示名称、头像、上次模式 | 单行设置；上次模式必须引用固定模式 |

`current_mainline_id`、`priority_todo_id` 和 `started_todo_id` 分别是当前主线、下一步与行动中事项指针。业务层在同一事务内完成指针更新、自动补位、槽位交换、事项重排和结束处理；无关主线结束或删除后，仍合法的三个指针必须保留，只有行动中事项不再是当前下一步时才清除。当天已记录的持续事项不再参与当日下一步补位。数据库触发器和唯一约束防止跨模式引用、系统模式变形与持续事项同日重复记录。`mainlines.normalized_name` 是内部唯一键：active 使用 `active:{state_id}:{canonical_name}`，行迹使用 `history:{mainline_id}`；展示名称保持原样且不作为身份。内部表与 API 保留 `states/todos/priority` 命名以兼容旧库，用户界面统一使用模式、事项和下一步。

## 目录与模块

- `src/server/config.mjs`：项目、数据目录和端口解析；Windows 只按真实数据库文件兼容旧目录，并拒绝双库歧义。
- `src/server/app-meta.mjs`：直接从 `package.json` 读取应用名称、完整 SemVer，并派生 macOS 合法数值版本。
- `scripts/launcher-config.mjs`：供 Node 服务、Windows 与 macOS 启动壳共享的版本、数据目录、端口和访问模式配置。
- `src/server/launcher-policy.mjs`：以纯函数决定复用、安全重启或端口冲突；启动壳不得凭端口号盲目终止进程。
- `src/server/database.mjs`：migration、连接生命周期、每日备份、下载备份与整库恢复。
- `src/server/service.mjs`：全部业务规则和 snapshot 组装。
- `scripts/serve.mjs`：loopback HTTP 边界、静态文件、API、导出、恢复和头像。
- `src/api.js`：同源浏览器客户端。
- `src/view-model.js`：无 DOM 的显示规则。
- `src/app.js`：页面渲染与交互编排。

## Routes

内部 API 以 `GET /api/snapshot` 为读取入口；主线、事项、设置和模式变更分别使用资源端点。`PATCH /api/todos/:id` 可更新 `title`、`minimalStep`，并把一次事项提升为持续事项；`POST /api/todos/:id/record` 与 `/undo-record` 原子写入或撤回当天完成事实；`POST /api/todos/:id/reopen` 把行迹事项撤回为 active，并在原主线已结束时解除主线归属。完整方法表、请求类型和错误结构见 [integration-guide.md](integration-guide.md)。

服务默认只接受 `Host: 127.0.0.1` 或 `localhost`。显式启用 Tailscale 模式时，共享同一数据库与请求处理器的第二个 HTTP listener 只绑定自动发现的本机 Tailscale IPv4，并把该精确地址加入 Host 白名单；本机 listener 保持不变。服务从不绑定 `0.0.0.0`。带 `Origin` 的请求必须与 Host 同源；JSON 变更请求必须使用 `application/json`。静态服务只暴露页面所需的前端文件与道路图片，不映射后端源码、仓库配置或 Git 元数据。这些边界用于阻止其他网页借浏览器访问数据；Tailscale 模式依赖 Tailnet ACL，不代表应用具备账号认证或公网接口。

## 数据生命周期

1. 启动时识别全部未运行的 migration。已有数据库升级前先 checkpoint WAL，并在 `backups/` 创建带起止 schema 版本和 UTC 时间戳的不可覆盖快照；全部待执行 migration 与 schema 记录在单一事务中执行，提交前必须通过 `integrity_check` 和 `foreign_key_check`。失败时事务完整回滚，迁移前快照保留。
2. 当天首次启动前创建一致性 SQLite 备份：先写同目录唯一临时文件，验证 `integrity_check`、`foreign_key_check`、SUOWANG 必需表、固定三模式和当前完整 migration 集后再提升为正式文件；当天文件已存在时也执行同一语义校验，合法但属于其他应用的 SQLite 或旧 schema 文件都用已验证候选替换。自动备份滚动保留 30 份。
3. 手动 SQLite 导出复用同一原子备份路径；JSON 导出只用于人类阅读。
4. 整库恢复先验证文件结构，再备份当前库，关闭连接并原子替换；失败时恢复安全副本。
5. 正式数据、备份、头像、访问配置、日志和临时导出始终跟随同一个仓库外数据目录。Windows 新安装使用 `%LOCALAPPDATA%/SUOWANG`；只有旧目录已经存在 `suowang.db` 时才继续使用 `D:/5Data/suowang`。两处都有数据库时停止并要求显式选择，不自动搬迁或合并。macOS 使用 `~/Library/Application Support/SUOWANG/`。

## 发行壳

Windows 安装包与 macOS Apple Silicon `.app` 都只是本地服务的启动壳，不改变浏览器 UI、HTTP API 或 SQLite 结构。两端先用统一配置查询预期版本、端口和访问模式，再读取 `/health` 与监听进程身份：完全匹配时复用，确认是旧 SUOWANG 时安全切换，无法验证时报告冲突且不终止进程。`/health` 只暴露应用、版本、数据库状态、schema 版本、PID 和访问模式，不暴露数据目录或业务数据。构建脚本从 nodejs.org 下载内置运行时后，必须用同版本官方 `SHASUMS256.txt` 对精确归档文件名和 SHA-256 做校验，再解压进入发行载荷。macOS `SUOWANG.app` 内置 arm64 Node.js 和在 Apple Silicon 上安装的 `better-sqlite3`。`.dmg` 仅面向 Apple Silicon（M1 及以后）；首版未签名、未公证，因此首次打开可能需要用户在 Gatekeeper 中明确确认。

## 验证与发行边界

Node 单元测试、Playwright 浏览器测试和临时 smoke 都显式使用仓库外临时 `SUOWANG_DATA_DIR` 与非默认端口，不连接个人服务。Playwright 单 worker 覆盖首次启动、主线与事项、开始/暂停、持续事项、行迹撤回、卡住面板、键盘、320px/1920px、减少动态效果和整库恢复；全局清理会删除测试数据。Visual Baseline 以 SHA-256 锁定四张批准道路资产，失败时不得自动接受新基线。

仓库级 `.npmrc` 禁用依赖安装生命周期脚本，避免 `better-sqlite3` 在已有锁定跨平台预编译文件时仍隐式调用 `node-gyp`。因此 CI 必须显式执行 Playwright Chromium 安装和发行工具准备；`npm ci` 后的单元与 health smoke 会验证当前平台原生 SQLite 模块确实可加载。

常规 CI 在 Linux、Windows 和 macOS 上分别用 Node 22/24 运行单元门禁与动态端口临时 smoke，并在 Linux 执行浏览器测试和包清单审计。Windows 与 macOS 候选工作流只接受完整 commit SHA：Windows 自动执行 Setup 静默安装、真实启动壳 health 与卸载后数据保留检查；macOS 挂载最终 DMG、复制 `.app`、运行真实启动壳并检查 health。候选只保存为短期 Actions artifact，不创建 Tag 或公开 Release。

人工完成 Windows/macOS 真实安装、升级与未签名打开验收后，聚合发布工作流核对两个成功候选运行都来自同一 SHA，下载精确 artifact 并复验 SHA-256。它再生成一份绑定版本、源 commit 和五个候选文件 SHA-256 的镜像清单，随后创建不可移动的 annotated Tag，在 Draft Release 中一次上传五项候选资产和镜像清单，核对名称齐全后才公开为 prerelease。任何既有 Tag 或 Release 都使流程失败，不允许 `--clobber`；因此用户可见 Release 不再经历先公开空壳、再异步追加或覆盖资产的窗口。本轮不创建 Tag 或 Release，也不声称 Gatekeeper、Safari 或人工升级路径已由自动化替代。

## 取舍

- 使用原生 Node HTTP 和 Vanilla JS，保持本地应用依赖面小。
- 使用同步 SQLite 驱动，把单用户短事务写成清楚的原子操作。
- 不建立操作监控或 audit/event 流水；`todo_occurrences` 仅保存用户明确提交的持续事项完成事实。主线结束后保持行迹事实，事项可从行迹撤回为 active 以纠正误操作。
- 不做 JSON 恢复或数据 merge，避免产生两套真源和模糊冲突规则。
