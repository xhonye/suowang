# SUOWANG 0.2.0-beta.1 · Desktop Shell Readiness

审计日期：2026-08-29

## 总裁决：BLOCK（本地 Windows 冻结候选完成）

Electron 薄壳实现与本地 Windows 工程验证通过；macOS arm64 构建、同 SHA 远端候选和真实用户安装尚未完成，所以桌面壳不能宣称跨平台发行完成。

## 20 项硬标准

| # | 验收项 | 状态 | 证据 / 缺口 |
|---:|---|---|---|
| 1 | 桌面图标打开独立窗口 | PASS（代码/本地 Setup） | Inno 直指 `SUOWANG.exe`；本地安装 smoke 通过，真实桌面图标留待候选验收 |
| 2 | 无浏览器地址栏 | PASS | BrowserWindow 加载动态 loopback origin |
| 3 | 无 PowerShell/终端 | PASS | Release payload 不含 runtime/start.ps1/SUOWANG.cmd，packaged smoke 直接运行 EXE |
| 4 | SUOWANG 名称与专属图标 | PASS（工程） | 单一 SVG 可复现生成 PNG/ICO/ICNS；EXE 元数据正确，任务栏视觉待 field acceptance |
| 5 | 第二次启动只激活原窗口 | PASS（自动化） | Electron single-instance 单元覆盖；候选 workflow 验证第二进程退出且数据库 owner 不变 |
| 6 | 关闭后无残留进程 | PASS（本地） | Electron E2E、packaged smoke、安装版 smoke 后无残留；修复了 Windows quit 等待问题 |
| 7 | 原有数据与设置保留 | PASS（受控 fixture） | v0.1-style fixture 保留名称、主线、事项、行迹、头像并生成迁移前备份 |
| 8 | 备份、导入、导出、恢复正常 | PASS | Node、Browser E2E 与 Electron E2E 覆盖 JSON/SQLite 导出和整库恢复 |
| 9 | Setup/Portable 共用 packaged app | PASS | 构建脚本从同一 Forge 输出复制后再 ZIP/Inno |
| 10 | macOS 原生 `.app` 窗口 | BLOCK | 工作流与 Forge 配置已实现，当前 Windows 主机无 arm64 运行证据 |
| 11 | renderer 无 Node 权限 | PASS | sandbox/context isolation，E2E 中 `require`/`process` 均不可见 |
| 12 | 无远程代码加载 | PASS | CSP、精确 origin 与请求拦截；资源全部在 ASAR/本地服务 |
| 13 | 离线启动 | PASS（设计/自动化） | 启动路径无账号、云、更新或遥测依赖 |
| 14 | 启动无主动外网请求 | PASS（E2E） | Electron E2E 记录外部请求为空 |
| 15 | GitHub 固定白名单 | PASS | renderer 只能提交 repo/issues/releases 枚举，main 再解析固定 URL |
| 16 | 现有测试继续通过 | PASS（本地） | 81 Node + 10 Browser E2E；最终提交后仍需远端重跑 |
| 17 | 新桌面测试通过 | PASS（本地） | 12 desktop unit + 1 Electron E2E + packaged smoke |
| 18 | Windows 安装/启动/卸载/数据保留 | PASS（本地有限） | `/NOICONS` 静默安装与卸载通过；最终快捷方式和升级安装需候选/人工复验 |
| 19 | macOS packaged smoke / DMG | BLOCK | 只能在 Apple Silicon candidate runner 和真机完成 |
| 20 | Public readiness 明确 | PASS | `PUBLIC_RELEASE_READINESS.md` 当前裁决为 BLOCK |

## 运行时与打包版本

- Electron `44.0.0`
- Chromium `152.0.7977.54`
- Electron runtime Node `24.18.1`
- Electron Forge `7.11.2`
- `better-sqlite3` `13.0.3`
- Playwright `1.62.1`
- Windows Inno Setup `6.7.3`（本地证据）

## 安全边界

- `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`、`webSecurity: true`。
- production 禁用 DevTools 用户入口；所有新窗口、非本地导航和权限请求默认拒绝。
- preload 不暴露任意 URL、命令、路径、文件系统、shell、数据库或原始 IPC。
- ASAR、native auto-unpack、ASAR integrity、OnlyLoadAppFromAsar 与禁用 RunAsNode/NODE_OPTIONS/CLI inspect fuses 已验证。
- Electronegativity 高风险阻断为 0，但其公开 Electron 版本数据库尚不认识 44.0.x；该工具限制不能被表述成“Electron 44 已获扫描器完整支持”。

## 尚存风险

1. macOS arm64 `.app`、DMG、Applications 拖放、Gatekeeper、签名/公证和无残留进程必须由目标系统验证。
2. 当前本地 Windows 资产未签名，并且基于未提交工作树；必须从最终 SHA 重新构建。
3. Forge/Electron 发行工具链的开发依赖审计仍含上游告警；`npm audit --omit=dev` 为 0，但需要持续升级和人工审查构建环境。
4. 首个 unsigned beta 可能触发 Windows SmartScreen 与 macOS Gatekeeper；文档必须如实说明，不得使用自签名证书冒充正式签名。
