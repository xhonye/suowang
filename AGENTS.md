# SUOWANG 项目合同

本文件是 SUOWANG 仓库根目录的当前执行合同。面向用户的产品与治理文字使用简体中文；代码、标识符、文件名和 commit message 使用英文。

## 产品身份

- 品牌：**所往 SUOWANG**
- 品类：**人生主线驾驶舱 / Mainline Cockpit**
- 品牌语义：**行有所往。**
- 全局口号：**充分参与这一次人生**
- 承诺：打开后 3 秒内知道自己处于什么模式、当前主线是什么；10 秒内知道下一步具体做什么；启动困难时还能看到足够容易迈出的最小一步。

SUOWANG 回答四个问题：我现在处于什么模式？我当前主要往哪里走？我现在具体做什么？如果知道要做却启动不了，怎样把第一步降到足够简单？它不是完整人生决策系统、Todo App、习惯打卡器、项目管理器、KPI 仪表盘、RPG 或 AI 聊天工具。

品牌精神语言固定为：**行有所往。知所往 · 择其径 · 行其事。** 精神层可以使用中国风表达，实际操作层保持现代白话，不使用“新增其事”“弃其径”等妨碍直觉的古文化按钮。

人生是无限游戏，主线只是有限、可结束的阶段使命。AI 可以帮助造驾驶舱，不能替用户驾驶。V0.1 核心功能 100% 不依赖 LLM。

## 固定信息模型

面向用户的核心模型固定为：**模式 → 主线 → 事项**。当前主线和下一步都是指针，不是新的业务实体或状态；最小一步是事项的可选字段，不另立习惯、启动器或奖惩系统。

系统永久只有三个模式，ID、名称和顺序不可增加、删除、改名或排序：

1. `restore` / 恢复
2. `work` / 工作
3. `life` / 生活

每个模式独立拥有：

- 最多 3 条 `active` 主线，固定占据槽位 1–3；不能隐藏第 4 条。
- 一个 `current_mainline_id` 指针。
- 一个 `priority_todo_id` 指针。
- 不归入主线的其他事项与可编辑 cue。

主线只有 `active / completed / abandoned` 三种状态。用户界面字段固定为主线名称、主线目标、本阶段完成标准、可选低精度本阶段时间范围；数据库字段继续使用稳定的 `success_criteria`。主线不能跨模式，彼此没有父子或 lineage。同一模式内 active 主线的规范化名称必须唯一；不同模式可以有同名 active 主线，行迹名称也可以重复。结束后的主线不可编辑或恢复，只能复制为具有新 ID 的独立主线；若同模式没有同名 active 主线，复制时可以沿用原名称。主线身份始终由 ID 决定，名称不是身份。

事项只有 `active / completed / abandoned` 三种状态，并分为 `single` / 一次事项与 `ongoing` / 持续事项。内部仍使用稳定的 `todos` 表、Todo API 名与 `state_id`，但用户界面和对外产品语言不得暴露 Todo/状态 Todo/主线 Todo。`state_id` 不可变，`mainline_id` 可空；事项可以在同模式的其他事项区和任意主线之间移动并保留 ID，不能跨模式。事项名称必填；可选 `minimal_step` / 最小一步回答“现在怎样最低成本迈出去”，严格区别于主线的本阶段完成标准。一次事项点击完成后进入行迹；持续事项点击“今天完成”只增加一条当日本地自然日记录，事项继续 active，同一天数据库最多接受一次。持续事项显示累计次数，不计算连续天数、缺卡、完成率、积分或奖惩，也不提供提醒；它只能通过右键“完成事项”或“放弃事项”进入行迹。行迹中的事项提供纠错用的撤回：恢复为 `active` 并保留原 ID；原归属主线仍 active 时回到该主线，否则回到同模式其他事项。

`current_mainline_id` 对外统一称“当前主线”，`priority_todo_id` 对外统一称“下一步”。它们是指针，不是业务状态。每个模式还可有一个 `started_todo_id` 指针，表示用户明确点击“开始这一步”的当前下一步；它不是事项的新状态、不追踪时长、不形成行为日志，且只能引用该模式当前的下一步。切当前主线不结束旧主线、不产生行迹、不记录事件。下一步只能引用当前主线事项或其他事项；当天已经记录完成的持续事项在当日不再参与补位，系统按「当前主线第一条可做 active 事项 → 其他事项第一条可做 active 事项 → null」接棒，次日不会自动抢回下一步。下一步变更、完成、放弃、删除或改归属时必须清除行动中指针；结束或删除无关主线时，只要当前主线、下一步与行动中事项仍合法，就必须原样保留三个指针。

主线完成与放弃是不可恢复的行迹事实；事项完成或放弃允许从行迹撤回，以纠正误操作。Hard delete 只用于纠错，必须确认，不能用数据库级 cascade 静默删除用户事项。

## 第一屏合同

V0.1 桌面优先，目标分辨率为 2560×1440，1920×1080 下核心驾驶信息仍须单屏可见。右侧 `page-stage` 是唯一页面级纵向滚动容器，必须在 DevTools 底部停靠、RDP、小窗口和常规桌面下始终滚到页面最底；`body` 不得承担滚动或截断内容，滚动能力不得依赖高度 media query。320px 窄屏必须可用，但不要求单屏。手机端不得把 3:1 全景图纵向拉伸：道路舞台缩为约 310–330px，并按当前模式无变形裁切对应道路；三个模式入口仍同时可见。三个主线槽在手机上缩为同排选择卡，必须无需横向滑动就能直接看到并点击；主线目标留在下方详情，不塞进窄卡。手机驾驶顺序优先让当前主线与下一步尽早出现，主线详情采用紧凑 2×2 布局；下一步卡片只保留中文标题，不显示 `NEXT STEP` 装饰字，并压缩为清楚可操作的紧凑高度；事项区按内容决定高度，空区不保留大块占位，事项较多时在列表内部滚动；底部导航适配系统安全区。桌面构图和批准视觉资产不因手机适配改变。

左栏固定只有驾驶舱、行迹、设置；个人区域只展示头像和显示名称，不展示使用天数、连续记录、完成数或其他激励统计。驾驶舱固定顺序为：

1. 三岔大道内的恢复 / 工作 / 生活路线 Tab
2. 三个主线槽
3. 当前主线详情条
4. 下一步
5. 当前主线事项与其他事项双栏

道路是唯一强视觉签名，三条道路永久映射恢复、工作、生活。道路不是独立图片卡片，而是驾驶舱上半部从内容区左缘铺到右缘的连续环境背景；不使用边框、圆角或容器阴影。问候、日期和口号直接贴在天空区域、透明无边框，随页面向下滚动自然消失，不设置顶栏，也不与主线内容叠字；问候进入“晚上好”后使用月亮而不是太阳。标题与 Cue 直接编排在天空区域。背景采用 demo 版的低饱和粉蓝灰、抬高暗部与柔和对比，保持晴朗但不艳；三张完整道路图只改变对应路线箭头高亮。箭头大而笔直，统一使用天空蓝，选中箭头更实、未选中箭头更透明，不使用白色填充、白色描边或霓虹光。桌面道路展示窗口约 `430–460px`，只通过网页 viewport 优先裁去一小段顶部天空，不修改、裁剪或重新生成原图片资产，并完整保留道路分叉、箭头和模式入口。背景下沿只用短而浅的渐变连接工作区，三个主线槽作为轻量 Dock 略压背景下沿，但渐变与 Dock 都不能遮挡道路分叉和路线箭头。三个路线点击区就是唯一的模式 Tab，不在标题区重复设置第二套切换器；路线 Tab 覆盖整条对应道路，按钮直接写“恢复模式 / 工作模式 / 生活模式”，不再附加“当前”解释，选中态由箭头、图标和按钮外观共同表达，并支持左右方向键、Home、End。右上 Cue 以“模式名 · 提示语”显示；恢复模式默认提示语为“休息好，才能重新出发。”第一屏宁可少露半截事项，也不能把三岔大道压成横幅。

点击主线卡立即设为当前主线。非当前主线不显示“进行中”等状态标签；当前卡主要依靠选中样式表达，并仅以低存在感文字补充“当前主线”。主线更多操作使用几何居中的 SVG 横向三点与圆形 hover 点击区。主线和事项文字均原地编辑。事项行展示“事项名称 ｜ 最小一步”，只有填写最小一步时才显示分隔符；空字段通过轻量入口添加。添加区可显式选择“持续”。持续只是事项属性：名称前不加属性标签，只在右侧完成按钮旁以低存在感的 `↻ N` 表示累计次数；今天完成只让 `✓` 进入安静选中态，不给整行染色。事项整行拖动可排序、改归属或设为下一步；一次事项末尾 `✓` 表示完成，持续事项末尾 `✓` 表示今天完成一次。事项右键生命周期文案统一为“完成事项 / 放弃事项 / 删除事项”；持续事项可额外撤回今天，一次事项可额外设为持续事项。主线右键完成、放弃或删除。系统永不按创建时间或日期自动重排。

下一步区域提供右上角低存在感的「卡住了？」入口。点击后调整面板原地接管整个下一步卡片，再点同一入口收拢；不开大弹窗、不新增页面，展开高度与普通下一步卡保持一致。为此可压缩“下一步”标题区，但必须保留四项完整解释。下一步卡片不重复显示所属主线，也不能作为事项被拖动。未开始时，卡片主操作为「开始这一步」；点击后持久化行动中指针，卡片显示「正在走这一步」，并把控制明确拆为「暂停」和完成操作。暂停只清除行动中指针，不结束、不改写也不记录事项。出发动效只发生在下一步卡内部：淡蓝色短促掠过，尊重减少动态效果，不修改道路背景、箭头或模式 Tab。面板不评判执行力，只允许用户调整四个维度：事情太难启动时缩小**步幅**（再小一点），此刻不适合时更换**动作**（换一件事），持续逃避时检查**方向**（看看主线），能量不足时切换**模式**（先去恢复）。这四项是既有模型的导航，不得扩张成新的业务实体、习惯系统或激励系统。

行迹只展示 completed/abandoned 事实并按 `ended_at DESC` 排序；行迹事项提供「撤回」，行迹主线仍只能复制为新主线。设置只放显示名称、本地头像、三个模式 cue、桌面「工作区空间」、SQLite/JSON 导出与整库恢复。工作区空间只有小 / 中 / 大 / 最大四档，默认小；它只通过网页展示窗口真实裁去顶部天空，底图与箭头保持固定尺度、道路下缘画面坐标不变，主线 Dock 始终以卡底低于道路下缘约 12px 的关系搭桥。该偏好保存在本地 SQLite；手机布局固定，不显示或应用这项裁切。

## 数据与技术合同

- 源码入口只承诺 Node 22 与 Node 24 LTS；普通用户桌面包固定使用 Electron `44.0.0` 内含的 Node `24.18.1`。核心产品继续使用 Vanilla JS、CSS、Node HTTP 与 `better-sqlite3`，不引入前端框架、ORM 或 Tauri。Electron 只承担独立窗口、单实例、原生文件对话框和系统链接等桌面集成；不得复制业务服务、改写 SQLite 真源或把 HTTP API 全部改成 IPC。
- 仓库安装通过 `.npmrc` 禁用依赖生命周期脚本，使用锁定的 `better-sqlite3` 跨平台预编译文件；Playwright 浏览器与发行工具必须由 CI 显式安装，不依赖隐式 postinstall。
- 浏览器 UI 只通过本地 JSON API 读写；SQLite 是业务数据唯一真源，`localStorage` 不得保存主线、事项或指针。
- 正式库首次启动只有固定三模式和设置，不注入 demo 主线、事项或假统计。
- migration 文件进入 Git；个人数据库、备份、头像、日志和导出必须在仓库外。
- `SUOWANG_DATA_DIR` 可用绝对路径显式指定数据目录并始终优先。Windows 新安装使用 `%LOCALAPPDATA%/SUOWANG`；只有检测到真实的 `D:/5Data/suowang/suowang.db` 时才继续兼容旧目录。两处同时存在数据库时必须报冲突并要求显式选择，不自动移动、复制或合并。macOS 使用 `~/Library/Application Support/SUOWANG/`，Linux 使用 XDG 或标准 home 数据目录。
- 已存在数据库有待执行 migration 时，必须先 checkpoint WAL 并创建不参与日常清理的完整迁移前备份；全部待执行 migration、schema 记录、`integrity_check` 与 `foreign_key_check` 在同一事务中通过后才能提交。每日备份与手动 SQLite 导出必须先写同目录临时文件，并验证 SQLite 完整性、外键、SUOWANG 必需表、固定三模式及当前完整 migration 集，再提升为正式文件；既有每日备份不能只凭文件存在就跳过验证。每天第一次启动自动备份 SQLite，按备份时间保留最后 30 份。手动导出不限；整库恢复前必须先备份当前库，不做 merge。
- Electron 桌面壳必须复用 `src/server/app-server.mjs`，使用动态 loopback 端口和同一 `resolveDataDir`；CLI/browser 兼容入口继续从 `launcher-config.mjs` 读取固定端口与访问模式。任何入口打开同一数据目录前都必须取得实例锁；只清理可验证的 stale lock，不得强杀未知进程。
- 不建立点击、切模式、切当前主线、拖拽或文字修改的 audit/event 流水；`todo_occurrences` 只保存用户明确确认的持续事项完成事实，不承担行为监控。

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

其中静态预览与视觉合同保留发布当时的 Current/Priority/Todo/状态措辞，作为 `v0.1.0` 历史基线，不再作为当前产品名词真源；当前产品语言以本文件和 `docs/product-brief.md` 为准。

默认禁止覆盖、删除、重新压缩或原地重画上述文件。视觉实验必须使用新文件名并先接入静态预览；只有用户明确审稿通过后才能更新正式页面引用和视觉基线哈希。只改箭头不得重画整幅背景，只调前端布局不得替换图片资产。

`1.0.0` 不以功能数量为标准。它表示核心驾驶循环经过持续真实使用，普通 Windows 用户无需工程协助即可安装和恢复数据，升级 migration 有旧库验证，关键 UI 有自动化防回归，并且产品仍保持“模式 → 当前主线 → 下一步 → 事项/最小一步”的低阻力边界。在这些条件成立前使用 `0.x` 版本推进。

## 弱模型与外部 Agent 边界

- 不得给能力或可靠性未充分验证的模型“整体优化”“自由重构”“改善视觉”等开放授权。
- 允许交付文档纠错、测试、CI、无障碍标签和范围明确且可自动验证的小 Bug；一次任务只处理一个边界。
- 涉及 `index.html`、`src/styles.css`、正式视觉资产、migration、备份恢复或核心业务规则时，先提出方案或制作隔离预览，不得直接接入正式版本。
- `desktop/`、`forge.config.mjs`、`installer/` 和发行工作流是桌面安全与升级边界；弱模型不得以“简化打包”为由关闭 sandbox、context isolation、ASAR integrity、single-instance、实例锁、导航白名单或 packaged smoke。
- 弱模型使用独立分支或 worktree，不得直接提交、push、打标签或发布 `main`；最终 diff、测试和视觉结果由用户或可信 Agent 审查。
- 不得删除视觉里程碑或本地探索归档；清理只能先列出引用和候选文件，等待用户明确批准。

## 当前源码布局

- `migrations/`：顺序执行的 SQLite schema migration。
- `src/server/`：路径配置、数据库运行时和原子业务规则。
- `src/server/app-meta.mjs`：从 `package.json` 读取应用名和完整语义版本；运行时代码、CLI、health 和发行资产不得另写版本常量。
- `src/server/app-server.mjs`：可复用的 HTTP 服务生命周期，返回实际 origin、端口、runtime、实例锁和 `close()`；桌面与浏览器入口共享。
- `scripts/serve.mjs`：浏览器/CLI 兼容入口，只负责解析启动参数并调用共享服务。
- `desktop/`：Electron main、sandbox preload、固定 IPC/外链策略、窗口状态、日志与单实例编排；renderer 无 Node、文件系统、shell 或原始 IPC 权限。
- `src/api.js`：浏览器 API 客户端。
- `src/view-model.js`：无 DOM 的显示规则。
- `src/app.js`：页面渲染与交互编排。
- `src/styles.css`：桌面第一屏与窄屏视觉系统。
- `scripts/start.ps1`、`SUOWANG.cmd`：仅供源码/npm 的浏览器兼容入口，不得作为普通用户安装包快捷方式目标。
- `forge.config.mjs`、`scripts/build-windows-release.ps1`、`scripts/build-macos-release.sh`：从同一 Forge packaged app 构建 Windows Portable/Setup 与 macOS arm64 DMG，并执行安全与 packaged smoke 门禁。
- `scripts/install-shortcut.ps1`：安装桌面快捷方式。
- `INSTALL.cmd`：Release 解压后的 Windows 双击安装入口。
- `scripts/cli.mjs`：npm 全局命令 `suowang` 的启动与快捷方式入口。
- `tests/`：数据库、迁移基线、事务、HTTP、视图规则和批准视觉资产哈希测试。
- `tests/e2e/`、`playwright.config.mjs`：使用独立临时数据目录与测试端口的浏览器核心流程、响应式和恢复回归；不得复用真实服务或更新正式视觉基线。
- `docs/architecture.md`、`docs/integration-guide.md`、`docs/operator-runbook.md`：架构、内部端点和本地运维真相。
- `docs/handoff.md`：当前已实现边界与后续维护入口。
- `docs/visual-final-preview.html`：正式页面当前 2172×724 分层视觉的静态交互基准；图片基座、透明箭头与生成溯源见 `assets/milestones/2026-08-23-arrow-pipeline/`。
- `.github/workflows/ci.yml`：Linux、Windows、macOS 的 Node 22/24 单元与临时 smoke 门禁、Linux Playwright 和 npm 包清单审计。
- `.github/workflows/release-windows.yml`、`.github/workflows/release-macos.yml`：只接受完整 commit SHA，构建并验证不可变候选资产，不依赖最终 Tag，也不修改 GitHub Release。
- `.github/workflows/publish-release.yml`：在人工安装升级验收后核对同 SHA 的双平台候选运行和校验和，创建不可移动 Tag，把完整资产放入 Draft Release，核齐后一次性公开；禁止覆盖既有 Tag、Release 或资产。

在仓库根目录运行：

```powershell
npm install
npm test
npm run check
npm run test:e2e
npm run verify
npm run desktop:start
npm run test:desktop
npm run verify:desktop
npm run release:check
npm start
```

本地地址为 `http://127.0.0.1:2037/`，健康检查为 `http://127.0.0.1:2037/health`。

默认访问边界永久保持仅本机。用户明确启用 `SUOWANG_ACCESS=tailscale` 时，服务在保留 loopback 的同时，只额外绑定自动发现的本机 Tailscale IPv4；不得绑定 `0.0.0.0`，不得把个人 IP、Tailnet 名称或访问配置提交到仓库。手机访问依赖同一 Tailnet 及其 ACL，不构成公网发布，也不提供应用级账号认证。

## 变更纪律

- 修改前检查当前分支、工作树和无关改动；低风险 SUOWANG 变更直接在 `main` 收口。
- 涉及产品定位、核心概念、名词体系、信息模型或交互哲学的修改，必须在同一轮更新本 `AGENTS.md`，并按对外/产品细节分别同步 `README.md` 或 `docs/product-brief.md`；不得只把已确认理念留在聊天记录里。
- 修改批准视觉资产前先运行视觉基线测试；测试失败即视为受保护内容发生变化，除非用户本轮明确批准新基线，否则不得更新哈希绕过失败。
- 修改 Electron 承载层不得重新设计页面或替换批准道路资产；生产窗口必须保持 `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`、固定外链白名单、无远程代码和无启动外网请求。
- 每个稳定业务规则都应有自动化测试；UI 改动必须真实验证 1920×1080、2560×1440 和 320px。
- `package.json` 是应用语义版本唯一真源。`/health` 必须返回 `app/version/database/schemaVersion/pid/accessMode`，不得暴露数据目录或业务数据；CLI、Windows/macOS 构建和启动器必须从同一版本与配置来源派生。
- 所有开发服务、单元测试、E2E、恢复与 smoke 必须显式使用临时 `SUOWANG_DATA_DIR` 和非默认测试端口；禁止用个人数据库验证 migration。已有数据库升级前必须先生成不可覆盖且通过完整性检查的迁移前备份。
- 发版前至少通过 `npm run release:check`、`npm run verify:desktop`、Visual Baseline 和 Node 22/24 跨平台 CI；`release:check` 必须包含临时数据库 smoke。候选构建必须以完整 commit SHA 为输入，并在目标系统由 Forge 重建或验证原生 SQLite 模块。Windows/macOS 候选必须来自同一 SHA，完成真实 packaged smoke 与人工安装升级验收后才能创建最终 Tag；公开 Release 必须先在 Draft 中集齐并验证全部资产，再一次性公开，禁止 `--clobber` 或替换既有同版本资产。不得以更新快照、改哈希、关闭 Electron 安全开关或跳过浏览器测试绕过失败。
- 面向公众的 GitHub 内容只服务于理解产品、下载安装、保护数据、安全报告和真实使用反馈。除非用户再次明确要求，不加入求 Star、开源资助申请、赞助、开发者招募或贡献者运营文案。
- 保持键盘焦点、非颜色状态表达和 `prefers-reduced-motion`。
- 不把私人主线、事项、数据库、日志、截图、凭据或导出放进 Git。
- 未经明确要求，不引入外部 API、云同步、遥测、账号、通知、AI 设置或未来导航入口。
- 功能、数据安全或浏览器交互只有在真实实现并验证后才能声称完成。

产品准入问题始终是：

> 它是否让“我现在处于什么模式、当前主要往哪里走、现在具体做什么、怎样更容易开始”变得更清楚？
