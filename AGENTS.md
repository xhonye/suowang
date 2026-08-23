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

Todo 只有 `active / completed / abandoned` 三种状态。`state_id` 不可变，`mainline_id` 可空；Todo 可以在同状态的通用区和任意主线之间移动并保留 ID，不能跨状态。历史 Todo 提供纠错用的撤回：恢复为 `active` 并保留原 ID；原归属主线仍 active 时回到该主线，否则回到同状态通用 Todo。

Current 和 Priority 是指针，不是业务状态。切 Current 不结束旧主线、不产生历史、不记录事件。Priority 只能引用当前状态通用 Todo 或 Current 主线 Todo；指针失效时按「Current 主线第一条 active Todo → 状态第一条 active Todo → null」补位。

主线完成与放弃是不可恢复的历史事实；Todo 完成或放弃允许从历史撤回，以纠正误操作。Hard delete 只用于纠错，必须确认，不能用数据库级 cascade 静默删除用户 Todo。

## 第一屏合同

V0.1 桌面优先，目标分辨率为 2560×1440，1920×1080 下核心驾驶信息仍须单屏可见。320px 窄屏必须可用，但不要求单屏。

左栏固定只有驾驶舱、历史、设置。驾驶舱固定顺序为：

1. 三岔大道内的恢复 / 工作 / 生活路线 Tab
2. 三个主线槽
3. Current 主线详情条
4. 当前优先
5. Current 主线 Todo 与状态 Todo 双栏

道路是唯一强视觉签名，三条道路永久映射恢复、工作、生活。道路不是独立图片卡片，而是驾驶舱上半部从内容区左缘铺到右缘的连续环境背景；不使用边框、圆角或容器阴影。驾驶舱不设独立顶栏，问候、日期、口号、标题与 Cue 直接编排在天空区域。背景采用 demo 版的低饱和粉蓝灰、抬高暗部与柔和对比，保持晴朗但不艳；三张完整道路图只改变对应路线箭头高亮。箭头大而笔直，统一使用天空蓝，选中箭头更实、未选中箭头更透明，不使用白色填充、白色描边或霓虹光。背景下沿只用短而浅的渐变连接工作区，三个主线槽作为轻量 Dock 略压背景下沿，但渐变与 Dock 都不能遮挡道路分叉和路线箭头。三个路线点击区就是唯一的状态 Tab，不在标题区重复设置第二套切换器；路线 Tab 覆盖整条对应道路，支持点击与左右方向键、Home、End，选中态同时显示状态名称和「当前」。第一屏宁可少露半截 Todo，也不能把三岔大道压成横幅。

点击主线卡立即设为 Current。主线和 Todo 的文字均原地编辑。Todo 整行拖动可排序、改归属或设为 Priority，末尾 `✓` 立即完成，右键放弃或 hard delete；主线右键完成、放弃或删除。系统永不按创建时间或日期自动重排。

历史只展示 completed/abandoned 事实并按 `ended_at DESC` 排序；历史 Todo 提供「撤回」，历史主线仍只能复制为新主线。设置只放显示名称、本地头像、三个 cue、SQLite/JSON 导出与整库恢复。

## 数据与技术合同

- Node 22+、Vanilla JS、CSS、`better-sqlite3`；不引入前端框架、ORM、Electron 或 Tauri。
- 浏览器 UI 只通过本地 JSON API 读写；SQLite 是业务数据唯一真源，`localStorage` 不得保存主线、Todo 或指针。
- 正式库首次启动只有固定三状态和设置，不注入 demo 主线、Todo 或假统计。
- migration 文件进入 Git；个人数据库、备份、头像、日志和导出必须在仓库外。
- `SUOWANG_DATA_DIR` 可显式指定数据目录；当前 Windows 机器默认使用 `D:/5Data/suowang`，其他机器回退到系统应用数据目录。
- 每天第一次启动自动备份 SQLite，按备份时间保留最后 30 份。手动导出不限；整库恢复前必须先备份当前库，不做 merge。
- 不建立点击、切状态、切 Current、拖拽或文字修改的 audit/event 流水。

## 版本里程碑与受保护基线

`v0.1.0` 是 SUOWANG 首个由用户明确验收核心体验、信息结构与整体视觉的可长期使用版本。三岔道路视觉经过两天高密度迭代才形成，不是临时 demo；它是产品身份的一部分，也是后续版本必须能够回到的受保护基线。`v0.1.0` 标签和 Release 不得移动、覆盖或重建。

以下内容构成 `v0.1.0` 的批准视觉基线：

- `assets/mainline-scene-bright-office-v1-no-arrows-geometry-v5.png`
- `assets/mainline-scene-bright-office-v1-arrow-restore-light-v2.png`
- `assets/mainline-scene-bright-office-v1-arrow-work-light-v4.png`
- `assets/mainline-scene-bright-office-v1-arrow-life-light-v2.png`
- `docs/visual-final-preview.html`
- `docs/visual-contract.md`
- `assets/milestones/2026-08-23-arrow-pipeline/`

默认禁止覆盖、删除、重新压缩或原地重画上述文件。视觉实验必须使用新文件名并先接入静态预览；只有用户明确审稿通过后才能更新正式页面引用和视觉基线哈希。只改箭头不得重画整幅背景，只调前端布局不得替换图片资产。

`1.0.0` 不以功能数量为标准。它表示核心驾驶循环经过持续真实使用，普通 Windows 用户无需工程协助即可安装和恢复数据，升级 migration 有旧库验证，关键 UI 有自动化防回归，并且产品仍保持“状态 → Current 主线 → Priority → Todo”的低阻力边界。在这些条件成立前使用 `0.x` 版本推进。

## 弱模型与外部 Agent 边界

- 不得给能力或可靠性未充分验证的模型“整体优化”“自由重构”“改善视觉”等开放授权。
- 允许交付文档纠错、测试、CI、无障碍标签和范围明确且可自动验证的小 Bug；一次任务只处理一个边界。
- 涉及 `index.html`、`src/styles.css`、正式视觉资产、migration、备份恢复或核心业务规则时，先提出方案或制作隔离预览，不得直接接入正式版本。
- 弱模型使用独立分支或 worktree，不得直接提交、push、打标签或发布 `main`；最终 diff、测试和视觉结果由用户或可信 Agent 审查。
- 不得删除视觉里程碑或本地探索归档；清理只能先列出引用和候选文件，等待用户明确批准。

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
- `INSTALL.cmd`：Release 解压后的 Windows 双击安装入口。
- `scripts/cli.mjs`：npm 全局命令 `suowang` 的启动与快捷方式入口。
- `tests/`：数据库、事务、HTTP 和视图规则测试。
- `docs/architecture.md`、`docs/integration-guide.md`、`docs/operator-runbook.md`：架构、内部端点和本地运维真相。
- `docs/handoff.md`：当前已实现边界与后续维护入口。
- `docs/visual-final-preview.html`：正式页面当前 2172×724 分层视觉的静态交互基准；图片基座、透明箭头与生成溯源见 `assets/milestones/2026-08-23-arrow-pipeline/`。

在仓库根目录运行：

```powershell
npm install
npm test
npm run check
npm run release:check
npm start
```

本地地址为 `http://127.0.0.1:2037/`，健康检查为 `http://127.0.0.1:2037/health`。

## 变更纪律

- 修改前检查当前分支、工作树和无关改动；低风险 SUOWANG 变更直接在 `main` 收口。
- 修改批准视觉资产前先运行视觉基线测试；测试失败即视为受保护内容发生变化，除非用户本轮明确批准新基线，否则不得更新哈希绕过失败。
- 每个稳定业务规则都应有自动化测试；UI 改动必须真实验证 1920×1080、2560×1440 和 320px。
- 保持键盘焦点、非颜色状态表达和 `prefers-reduced-motion`。
- 不把私人主线、Todo、数据库、日志、截图、凭据或导出放进 Git。
- 未经明确要求，不引入外部 API、云同步、遥测、账号、通知、AI 设置或未来导航入口。
- 功能、数据安全或浏览器交互只有在真实实现并验证后才能声称完成。

产品准入问题始终是：

> 它是否让“我现在处于什么状态、当前主要往哪里走、接下来优先做什么”变得更清楚？
