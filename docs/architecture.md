# SUOWANG 0.2 beta 架构

## 系统边界

SUOWANG 是本地优先应用。Electron 只为普通用户提供独立桌面窗口与系统集成；Vanilla JS renderer 仍通过 same-origin HTTP 使用现有 Node 服务，SQLite 仍是唯一正式业务真源。源码/npm 浏览器兼容模式默认只监听 loopback，并可由用户显式增加受限 Tailscale 访问。

```text
Electron main                         Browser / CLI compatibility
   │ start shared server                   │ scripts/serve.mjs
   │ dynamic loopback                      │ fixed loopback + optional Tailscale
   ▼                                       ▼
src/server/app-server.mjs ─────────────────┘
   │ static UI + same-origin JSON API
   ├─ SuowangService：模式、主线、事项、指针规则
   ├─ DatabaseRuntime：migration、备份、恢复
   └─ SQLite：仓库外 suowang.db + data-dir instance lock

Sandbox renderer
   ├─ no Node / fs / shell / database
   └─ narrow preload bridge for dialogs and fixed GitHub targets
```

应用不连接云服务，不发送遥测，不加载远程代码，也不在 renderer 中保存主线、事项或指针。每次写操作返回最新 snapshot，前端不自行猜测事务结果。

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
- `src/server/app-server.mjs`：桌面与浏览器入口共用的服务 bootstrap，显式接收 resource root，返回 server、origin、actualPort、runtime、实例锁和 `close()`。
- `src/server/instance-lock.mjs`：跨 Electron/CLI 的数据目录所有权；原子创建并只清理可验证 stale lock，不终止未知进程。
- `scripts/launcher-config.mjs`、`src/server/launcher-policy.mjs`：浏览器兼容入口的版本、端口、访问模式与旧服务识别策略。
- `scripts/start.ps1`：复用或切换旧服务前核对精确 Node/入口、端口 PID、当前数据目录实例锁；终止前再次核对锁 token 和进程创建时间，拒绝其他安装或数据目录。没有可验证实例锁的旧入口须先手动退出。
- `src/server/database.mjs`：migration、连接生命周期、每日备份、下载备份与整库恢复。
- `src/server/service.mjs`：全部业务规则和 snapshot 组装。
- `scripts/serve.mjs`：精简浏览器/CLI 入口，调用共享 app server。
- `desktop/main.js`：Electron 生命周期、单实例、动态 loopback 服务、窗口、原生对话框、退出与故障处理。
- `desktop/preload.cjs`：sandbox 中的固定 bridge；不暴露 Electron IPC、路径或任意 URL。
- `desktop/desktop-policy.mjs`：loopback origin、导航、GitHub 目标与 IPC 参数白名单。
- `desktop/window-state.mjs`：数据目录内独立 JSON 的窗口 bounds/maximized 状态，损坏或屏幕变化时安全回退。
- `src/api.js`：同源浏览器客户端。
- `src/view-model.js`：无 DOM 的显示规则。
- `src/app.js`：页面渲染与交互编排。

## Routes

内部 API 以 `GET /api/snapshot` 为读取入口；主线、事项、设置和模式变更分别使用资源端点。`PATCH /api/todos/:id` 可更新 `title`、`minimalStep`，并把一次事项提升为持续事项；`POST /api/todos/:id/record` 与 `/undo-record` 原子写入或撤回当天完成事实；`POST /api/todos/:id/reopen` 把行迹事项撤回为 active，并在原主线已结束时解除主线归属。完整方法表、请求类型和错误结构见 [integration-guide.md](integration-guide.md)。

服务默认只接受 `Host: 127.0.0.1` 或 `localhost`。显式启用 Tailscale 模式时，共享同一数据库与请求处理器的第二个 HTTP listener 只绑定自动发现的本机 Tailscale IPv4，并把该精确地址加入 Host 白名单；本机 listener 保持不变。服务从不绑定 `0.0.0.0`。带 `Origin` 的请求必须与 Host 同源；JSON 变更请求必须使用 `application/json`。静态服务只暴露页面所需的前端文件与道路图片，不映射后端源码、仓库配置或 Git 元数据。这些边界用于阻止其他网页借浏览器访问数据；Tailscale 模式依赖 Tailnet ACL，不代表应用具备账号认证或公网接口。

## 数据生命周期

1. 启动时识别全部未运行的 migration。已有数据库升级前先 checkpoint WAL，并在 `backups/` 创建带起止 schema 版本和 UTC 时间戳的不可覆盖快照；全部待执行 migration 与 schema 记录在单一事务中执行，提交前必须通过 `integrity_check` 和 `foreign_key_check`。失败时事务完整回滚，迁移前快照保留。
2. 当天首次启动前创建一致性 SQLite 备份：先写同目录唯一临时文件，验证 `integrity_check`、`foreign_key_check`、SUOWANG 必需表、固定三模式和当前完整 migration 集后再提升为正式文件；当天文件已存在时也执行同一语义校验，合法但属于其他应用的 SQLite 或旧 schema 文件都用已验证候选替换。自动备份滚动保留 30 份。
3. 手动 SQLite 导出复用同一原子备份逻辑；每次下载和恢复前快照使用独立随机操作 ID，同毫秒请求不会共用或覆盖文件。JSON 导出只用于人类阅读。
4. 整库恢复先验证文件结构，再备份当前库，关闭连接并原子替换；失败时恢复安全副本。
5. 正式数据、备份、头像、访问配置、日志和临时导出始终跟随同一个仓库外数据目录。Windows 新安装使用 `%LOCALAPPDATA%/SUOWANG`；只有旧目录已经存在 `suowang.db` 时才继续使用 `D:/5Data/suowang`。两处都有数据库时停止并要求显式选择，不自动搬迁或合并。macOS 使用 `~/Library/Application Support/SUOWANG/`。

## Electron 信任边界

桌面壳不改变页面、HTTP API 或 SQLite 结构。main process 在随机可用 loopback 端口启动共享服务，BrowserWindow 只加载本次得到的精确 origin；`will-navigate`、`window.open` 与权限请求默认拒绝。只有 repo、Issues、Releases 三个枚举目标能通过 main process 调用系统浏览器。preload 只提供版本信息、打开数据目录、固定 GitHub 目标和受 main 所有的文件选择/保存流程；renderer 永远得不到任意路径访问、shell、数据库或原始 IPC。

生产窗口开启 sandbox、context isolation、web security 与严格 CSP，关闭 nodeIntegration、insecure content 和 DevTools 用户入口。Forge 开启 ASAR、native auto-unpack、fuses 与 ASAR integrity；Electronegativity 的高风险结果阻断打包验证。桌面模式不检查更新、不发遥测、不在启动期间请求外网；离线可完整工作。

Windows Setup 与 Portable ZIP 复制同一 Forge packaged app，快捷方式直接指向 `SUOWANG.exe`。macOS `.dmg` 包含真正的 Electron arm64 `.app` 与 Applications 拖放入口。两端在目标 OS 重建或验证 `better-sqlite3`，并用真正 packaged executable 执行隐藏窗口、renderer、health、数据库写入和正常退出 smoke。未配置正式凭据时只标记 `UNSIGNED`；macOS 只有实际完成 notarization 才标记 `SIGNED+NOTARIZED`。

## 验证与发行边界

Node 单元测试、Playwright 浏览器测试和临时 smoke 都显式使用仓库外临时 `SUOWANG_DATA_DIR` 与非默认端口，不连接个人服务。Playwright 单 worker 覆盖首次启动、主线与事项、开始/暂停、持续事项、行迹撤回、卡住面板、键盘、320px/1920px、减少动态效果和整库恢复；全局清理会删除测试数据。Visual Baseline 以 SHA-256 锁定四张批准道路资产，失败时不得自动接受新基线。

仓库级 `.npmrc` 禁用依赖安装生命周期脚本，避免 `better-sqlite3` 在已有锁定跨平台预编译文件时仍隐式调用 `node-gyp`。因此 CI 必须显式执行 Playwright Chromium 安装和发行工具准备；`npm ci` 后的单元与 health smoke 会验证当前平台原生 SQLite 模块确实可加载。

常规 CI 在 Linux、Windows 和 macOS 上分别用 Node 22/24 运行单元门禁与动态端口临时 smoke，在 Linux 执行浏览器测试，并在 Windows/macOS 执行 Electron 单元与开发态 E2E。Windows 与 macOS 候选工作流只接受完整 commit SHA：Windows 同时验证 Lite/Desktop 的 Portable、静默安装、直接 EXE/快捷方式启动、无可见命令壳、视觉资产、单实例、受控旧 schema 升级、卸载和数据保留；macOS 挂载最终 DMG、复制 `.app`、执行 packaged smoke、受控升级并检查无残留进程。候选只保存为短期 Actions artifact，不创建 Tag 或公开 Release。

人工完成 Windows/macOS 安装、升级与未签名打开验收后，聚合发布工作流核对完整 main CI 与两个成功候选运行都来自同仓库、同一 SHA，验证 workflow 路径与事件，下载精确 artifact 并复验 SHA-256。它读取候选的真实签名状态，生成绑定版本、完整源 commit、Electron 版本、双平台签名状态和七个候选文件 SHA-256 的镜像清单，随后创建不可移动的 annotated Tag，在 Draft Release 中上传四个 Windows 发行物、Windows 校验和、两个 macOS 文件及镜像清单，重新下载并逐字节比对后才公开为 prerelease。任何既有 Tag 或 Release 都使流程失败，不允许 `--clobber`。构建依赖的已知风险、输入约束和限时审查见 `security-review-beta.3.md`。

## 取舍

- Electron 只作为普通用户承载层，继续使用原生 Node HTTP 和 Vanilla JS，避免复制业务或形成桌面专用数据层。
- 使用同步 SQLite 驱动，把单用户短事务写成清楚的原子操作。
- 不建立操作监控或 audit/event 流水；`todo_occurrences` 仅保存用户明确提交的持续事项完成事实。主线结束后保持行迹事实，事项可从行迹撤回为 active 以纠正误操作。
- 不做 JSON 恢复或数据 merge，避免产生两套真源和模糊冲突规则。
