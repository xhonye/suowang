# SUOWANG 当前实施交接

## 当前已有

- 三个永久模式及每个模式三个 active 主线槽。
- 每个模式独立记忆当前主线、下一步、其他事项和 cue。
- 主线与事项的创建、原地编辑、排序、改归属、完成、放弃、事项行迹撤回、纠错删除和行迹。
- 事项包含必填名称与可选最小一步，并分为一次事项与持续事项；持续事项每天最多记录一次、显示累计次数、支持撤回今天和明确结束。
- 主线结束时逐条处理 active 事项，行迹主线复制为新主线。
- SQLite migration、每日备份、JSON/SQLite 导出、整库安全恢复和本地头像。
- Windows 双击入口、重复启动保护和桌面快捷方式。
- Windows 同时提供 Lite 与 Desktop 自包含承载层：Lite 使用无控制台原生启动器、包内 Node 与默认浏览器，Desktop 使用 Electron 独立窗口；macOS Apple Silicon 继续提供 Electron `.app` / `.dmg`。
- npm CLI（`suowang`）与双击安装入口（`INSTALL.cmd`）。
- 1920×1080、2560×1440 与 320px 响应式驾驶舱；大窗口只延展事项列表，下一步保持稳定紧凑高度。

核心产品与数据模型从 `0.1.0` 起形成不可改写的发布基线；Electron 桌面壳、持续事项、行动中指针与后续视觉适配在 `0.2` Beta 继续演进。任何已发布 Tag 都不可移动或重打，后续改变必须通过新 commit 和新版本推进。

## 真实运行边界

- 正式数据在仓库外。Windows 新安装默认使用 `%LOCALAPPDATA%/SUOWANG`；只有检测到真实旧数据库时才兼容 `D:/5Data/suowang`，双库并存时必须显式选择且不自动合并。
- macOS 正式数据在 `~/Library/Application Support/SUOWANG/`；首版仅面向 Apple Silicon，未签名、未公证。
- V0.1 不依赖 LLM、账号、云服务、遥测或远程数据库。
- 本地 HTTP 服务默认只接受 loopback Host 和同源浏览器请求；可显式启用受限 Tailscale 双监听。
- JSON 是阅读导出；只有 SQLite 导出能用于恢复。

## 维护入口

- 产品与工程合同：`AGENTS.md`
- 使用说明：`README.md`
- 产品模型：`docs/product-brief.md`
- 视觉约束：`docs/visual-contract.md`
- 当前分层视觉预览：`docs/visual-final-preview.html`
- 左侧品牌标识：`assets/brand/suowang-scenic-mark-v1.png`
- 图片与箭头里程碑：`assets/milestones/2026-08-23-arrow-pipeline/MILESTONE.md`
- 架构与数据流：`docs/architecture.md`
- 内部端点：`docs/integration-guide.md`
- 启动、备份与故障处理：`docs/operator-runbook.md`
- 发布记录：`CHANGELOG.md`
- 双平台候选构建：`.github/workflows/release-windows.yml`、`.github/workflows/release-macos.yml`；均以完整 commit SHA 为输入，只产出短期 Actions artifact。Windows artifact 固定包含 Lite/Desktop 两套 Setup/Portable、统一 SHA-256 与真实入口验收。
- 聚合公开发布：`.github/workflows/publish-release.yml`；只有同 SHA 的完整 main CI、双平台候选与人工安装升级证据齐全后，才创建最终 Tag，在 Draft 中集齐资产并回读字节后一次性公开。
- 发布前安全审查与剩余风险：`docs/security-review-beta.3.md`；`npm run audit:build` 对未修复的已知开发依赖告警限时复核，未知或运行时告警阻断。

## 变更闸门

修改稳定业务规则时，先在 `src/server/service.mjs` 形成原子事务并补自动化测试。涉及 UI 时同时检查 1920×1080、2560×1440 和 320px。涉及数据格式、端点、环境变量或启动方式时，同步架构、接口和运维文档。

不把旧 Timeline、Theme/Run/Round、假统计、专注 session、隐藏 backlog、localStorage 业务真源或运行时 AI 带回当前产品。
