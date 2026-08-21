# SUOWANG 项目合同

本文件是 `A:/2Workspace/Projects/suowang` 的当前执行合同。面向用户的产品与治理文字使用简体中文；代码、标识符、文件名和 commit message 使用英文。

## 产品身份

- 品牌：**所往 SUOWANG**
- 品类：**人生主线驾驶舱 / Mainline Cockpit**
- 品牌语义：**行有所往。**
- 全局口号：**充分参与这一次人生**
- 承诺：打开后 3 秒内知道自己处于什么状态、当前主线是什么；10 秒内知道下一步优先做什么。

SUOWANG 回答三个问题：我现在处于什么状态？我当前主要往哪里走？接下来优先做什么？它不是完整人生决策系统、Todo App、项目管理器、KPI 仪表盘、RPG 或 AI 聊天工具。

人生是无限游戏，主线只是有限、可结束的阶段使命。AI 可以帮助造驾驶舱，不能替用户驾驶。V0.1 核心功能 100% 不依赖 LLM。

## 固定信息模型

系统永久只有三个状态，ID、名称和顺序不可增加、删除、改名或排序：

1. `restore` / 恢复
2. `work` / 工作
3. `life` / 生活

每个状态独立拥有：

- 最多 3 条 `active` 主线，固定占据槽位 1–3；不能隐藏第 4 条。
- 一个 `current_mainline_id` 指针。
- 一个 `priority_todo_id` 指针。
- 状态通用 Todo 与可编辑 cue。

主线只有 `active / completed / abandoned` 三种状态。主线字段固定为名称、一句话目标、完成标准、可选低精度阶段跨度。主线不能跨状态，彼此没有父子或 lineage。结束后的主线不可编辑或恢复，只能复制为具有新 ID 和全局唯一新名称的独立主线。

Todo 只有 `active / completed / abandoned` 三种状态。`state_id` 不可变，`mainline_id` 可空；Todo 可以在同状态的通用区和任意主线之间移动并保留 ID，不能跨状态。

Current 和 Priority 是指针，不是业务状态。切 Current 不结束旧主线、不产生历史、不记录事件。Priority 只能引用当前状态通用 Todo 或 Current 主线 Todo；指针失效时按「Current 主线第一条 active Todo → 状态第一条 active Todo → null」补位。

完成与放弃是历史事实。Hard delete 只用于纠错，必须确认，不能用数据库级 cascade 静默删除用户 Todo。

## 第一屏合同

V0.1 桌面优先，目标分辨率为 2560×1440，1920×1080 下核心驾驶信息仍须单屏可见。320px 窄屏必须可用，但不要求单屏。

左栏固定只有驾驶舱、历史、设置。驾驶舱固定顺序为：

1. 恢复 / 工作 / 生活 Tab
2. 三岔大道
3. 三个主线槽
4. Current 主线详情条
5. 当前优先
6. Current 主线 Todo 与状态 Todo 双栏

道路是唯一强视觉签名，三条道路永久映射恢复、工作、生活；Tab 是主要切换器，道路也可点击并与 Tab 同步。主线槽独立位于道路下方，不覆盖道路。视觉保持明亮、清澈、阳光充足，三状态不使用三套强主题色。运行时只保留恢复、工作、生活三张完整道路图，三图的场景、机位、天气和道路必须高度一致，只改变对应路线箭头的高亮。第一屏宁可少露半截 Todo，也不能把三岔大道压成横幅；道路必须先让人产生「我站在这里，前面有三条路」的空间感，再承接 Current 与 Priority。

点击主线卡立即设为 Current。主线和 Todo 的文字均原地编辑。Todo 整行拖动可排序、改归属或设为 Priority，末尾 `✓` 立即完成，右键放弃或 hard delete；主线右键完成、放弃或删除。系统永不按创建时间或日期自动重排。

历史只展示 completed/abandoned 事实并按 `ended_at DESC` 排序。设置只放显示名称、本地头像、三个 cue、SQLite/JSON 导出与整库恢复。

## 数据与技术合同

- Node 22+、Vanilla JS、CSS、`better-sqlite3`；不引入前端框架、ORM、Electron 或 Tauri。
- 浏览器 UI 只通过本地 JSON API 读写；SQLite 是业务数据唯一真源，`localStorage` 不得保存主线、Todo 或指针。
- 正式库首次启动只有固定三状态和设置，不注入 demo 主线、Todo 或假统计。
- migration 文件进入 Git；个人数据库、备份、头像、日志和导出必须在仓库外。
- `SUOWANG_DATA_DIR` 可显式指定数据目录；当前 Windows 机器默认使用 `D:/5Data/suowang`，其他机器回退到系统应用数据目录。
- 每天第一次启动自动备份 SQLite，按备份时间保留最后 30 份。手动导出不限；整库恢复前必须先备份当前库，不做 merge。
- 不建立点击、切状态、切 Current、拖拽或文字修改的 audit/event 流水。

## 当前源码布局

- `migrations/`：顺序执行的 SQLite schema migration。
- `src/server/`：路径配置、数据库运行时和原子业务规则。
- `scripts/serve.mjs`：loopback HTTP API、静态服务、导出和恢复。
- `src/api.js`：浏览器 API 客户端。
- `src/view-model.js`：无 DOM 的显示规则。
- `src/app.js`：页面渲染与交互编排。
- `src/styles.css`：桌面第一屏与窄屏视觉系统。
- `scripts/start.ps1`、`SUOWANG.cmd`：Windows 一键启动。
- `scripts/install-shortcut.ps1`：安装桌面快捷方式。
- `tests/`：数据库、事务、HTTP 和视图规则测试。
- `docs/architecture.md`、`docs/integration-guide.md`、`docs/operator-runbook.md`：架构、内部端点和本地运维真相。
- `docs/handoff.md`：当前已实现边界与后续维护入口。

在仓库根目录运行：

```powershell
npm install
npm test
npm run check
npm start
```

本地地址为 `http://127.0.0.1:2037/`，健康检查为 `http://127.0.0.1:2037/health`。

## 变更纪律

- 修改前检查当前分支、工作树和无关改动；低风险 SUOWANG 变更直接在 `main` 收口。
- 每个稳定业务规则都应有自动化测试；UI 改动必须真实验证 1920×1080、2560×1440 和 320px。
- 保持键盘焦点、非颜色状态表达和 `prefers-reduced-motion`。
- 不把私人主线、Todo、数据库、日志、截图、凭据或导出放进 Git。
- 未经明确要求，不引入外部 API、云同步、遥测、账号、通知、AI 设置或未来导航入口。
- 功能、数据安全或浏览器交互只有在真实实现并验证后才能声称完成。

产品准入问题始终是：

> 它是否让“我现在处于什么状态、当前主要往哪里走、接下来优先做什么”变得更清楚？
