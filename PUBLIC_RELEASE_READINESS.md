# SUOWANG 0.2.0-beta.1 · Public Release Readiness

审计日期：2026-08-29

## 总裁决：BLOCK

代码、浏览器兼容入口、安全 Electron 薄壳、Windows 本地 package/Setup/Portable 与受控旧库升级已形成可验证候选，但本轮明确不 push、Tag 或发布。最终候选 SHA 尚未产生远端 CI、Windows/macOS 同 SHA artifact、Apple Silicon DMG smoke 和人工安装证据，因此不能创建 `v0.2.0-beta.1`。

本文件不写入包含自身的最终 commit SHA。提交后以 `git rev-parse HEAD` 取得完整 40 位 SHA，并把同一 SHA 交给两个候选工作流。

## 当前证据

| 检查 | 状态 | 结果 |
|---|---|---|
| 公开表面与运行时依赖 | PASS | `npm run audit:public` 与 `npm audit --omit=dev` 通过；未跟踪个人数据库、备份、日志或发行资产 |
| 核心 Node / Browser | PASS | 81 项 Node 测试与 10 项 Chromium E2E 使用临时数据目录；批准道路资产哈希不变 |
| Electron 开发态 | PASS | 12 项桌面单元测试与 1 项完整 Electron E2E 通过；renderer 无 Node，外链/导航/窗口受白名单限制 |
| Windows packaged app | PASS（本地） | Electron 44.0.0 / Chromium 152.0.7977.54 / Node 24.18.1；ASAR、fuses、native unpack、数据库写入和正常退出 smoke 通过 |
| Electron 安全扫描 | PASS（有保留） | 自定义发行审计与 Electronegativity 高风险阻断为 0；Electronegativity 的 Electron release 数据库尚不认识 44.0.x，不能替代人工安全审查 |
| Windows Setup / Portable | PASS（本地） | Setup、Portable 与 SHA-256 已生成；Setup 静默安装、受控旧 schema 升级、packaged smoke、卸载及数据保留通过；测试使用 `/NOICONS`，真实桌面快捷方式留给候选 CI/人工验收 |
| macOS app / DMG | BLOCK | Forge、DMG、签名/公证接口和 GitHub Actions 已实现，但当前 Windows 主机不能提供真实 arm64 `.app`、DMG 挂载与 Gatekeeper 证据 |
| 同 SHA 双平台候选 | BLOCK | 当前分支尚未 push，候选 Actions 尚未运行 |
| 代码签名 | ACCEPTED BETA RISK | 当前本地 Windows 资产为 `UNSIGNED`；macOS 未构建。公开 Beta 可明确标注 unsigned，但不得声称 signed/notarized |
| 真实陌生用户安装 | BLOCK | 尚无最终 SHA 的 Windows 桌面快捷方式、macOS Applications 拖放和普通用户 field acceptance |

## 本地 Windows 证据

- `SUOWANG-Setup-0.2.0-beta.1.exe`：113,583,236 bytes，SHA-256 `5e036d7d456344fcc87ac4eac43acda335180af42a80628376920e09ef337da9`
- `SUOWANG-Portable-0.2.0-beta.1.zip`：161,337,684 bytes，SHA-256 `99fccef351eaf492b22d00c150cf5a63e6b3e0fce69dca8c781de1da20dc13e8`

这些文件由尚未提交的工作树构建，只是本地工程证据，**不是可发布候选**。最终提交后必须从完整 SHA 重新构建，不能复用或上传本地文件。

## 预期公开资产

同一个最终 SHA 应生成六项公开资产：

1. `SUOWANG-Setup-0.2.0-beta.1.exe`
2. `SUOWANG-Portable-0.2.0-beta.1.zip`
3. `SUOWANG-0.2.0-beta.1-SHA256SUMS.txt`
4. `SUOWANG-0.2.0-beta.1-mac-arm64.dmg`
5. `SUOWANG-0.2.0-beta.1-mac-arm64-SHA256SUMS.txt`
6. `SUOWANG-0.2.0-beta.1-MIRROR-MANIFEST.txt`

Windows/macOS artifact 另带 `SIGNING-STATUS.txt` 供发布流程读取，但它不是公开 Release 资产。最终 mirror manifest 必须记录版本、完整源 SHA、Electron 版本、双平台签名状态与五个二进制/校验文件的 SHA-256。百度网盘只能原样镜像 GitHub Release 的相同文件。

## Tag / Release 前必须完成

1. 审查并提交当前分支，取得最终 40 位 SHA；本轮不要 push。
2. 后续由用户授权后 push，等待该 SHA 的 Node 22/24、Browser、Desktop、package/public/runtime audit 全绿。
3. 使用同一 SHA 分别运行 Windows 与 macOS candidate workflow。
4. 保存 Windows Setup/快捷方式/Portable/升级/卸载数据保留证据，以及 Apple Silicon DMG/Applications/启动/升级/退出证据。
5. 核对候选签名状态、SHA-256 与 run provenance；启用 GitHub Private vulnerability reporting。
6. 只有全部完成，才输入 `INSTALL_VERIFIED` 运行聚合工作流；已有 Tag、Release 或资产时必须失败，禁止覆盖。

## 结论

- 是否可继续形成本地提交：**PASS**。
- 是否可生成同 SHA 双平台候选：**PASS（流程已准备，远端尚未执行）**。
- 是否可创建 `v0.2.0-beta.1` 或 Public Release：**BLOCK**。
