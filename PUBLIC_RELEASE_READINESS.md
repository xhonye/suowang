# SUOWANG 0.2.0-beta.1 · Public Release Readiness

审计日期：2026-08-29

## 总裁决：BLOCK

仓库当前内容已经完成公开表面整改与本地门禁准备，但**还不能创建 `v0.2.0-beta.1` Tag 或公开 Release**。阻断项是最终 commit 的远端 CI、同 SHA 双平台候选资产，以及真实安装与升级验收。

本文件所在 commit 即候选目标；提交后必须用 `git rev-parse HEAD` 取得完整 40 位 SHA，并把同一个 SHA 传给 Windows、macOS 候选工作流。发布流程会把该 SHA 写入镜像清单。由于 Git 文件不能可靠地写入包含自身的 commit SHA，本文件不保存会自指失效的哈希。

## 审计结果

| 检查 | 状态 | 结果 |
|---|---|---|
| 当前 tracked/candidate files 的高置信密钥模式 | PASS | 未发现 AWS、GitHub、OpenAI Token、私钥或明文赋值 secret |
| 私人数据库、备份、日志和发行包 | PASS | Git 未跟踪 `.db`、`.sqlite`、日志、备份、EXE、ZIP 或 DMG；`dist/` 与本地缓存保持忽略 |
| 当前个人开发路径 | PASS | README、运维文档和 AGENTS 已移除本机工作区绝对路径，源码示例使用 `<path-to-suowang>` |
| Windows 旧数据目录 | PASS（允许例外） | `D:/5Data/suowang` 只保留在旧版兼容实现、测试和明确标注的历史兼容文档中；新用户默认 `%LOCALAPPDATA%/SUOWANG` |
| 当前产品截图 | PASS | README 使用临时数据库和中性演示事项生成的当前界面截图，不含真实用户数据 |
| 项目起因截图 | PASS（人工检查） | 姓名和头像已像素化；不包含数据库、账号、路径或联系方式 |
| 早期概念图 | PASS（明确标注） | 包含概念占位名 Alex 和演示事项，README 已说明它不是当前界面或真实用户数据 |
| 已发布 migration | PASS（允许例外） | `001_init.sql` 保留历史个人默认名，因为 migration 001–006 受 SHA-256 基线保护；新数据库会被后续 migration 中性化，浏览器回归也禁止显示旧默认名 |
| Git 完整历史高置信 secret 扫描 | PASS（模式扫描） | 扫描 41 个 commits / 664 个 objects，未命中常见云密钥、GitHub/OpenAI Token、私钥或明文赋值 secret；这不是第三方专业取证保证 |
| Git 历史个人元数据 | PASS（所有者已接受） | 41 个旧 commit 的 author metadata 使用公开项目邮箱，历史中也出现过本机工作区路径；仓库所有者已于 2026-08-29 接受该披露并撤回历史重写。主邮箱未出现在 commit metadata 或历史文件中；后续提交统一使用 GitHub noreply 地址 |
| 本地发行门禁 | PASS | 2026-08-29：67 项 Node 测试、10 项 Chromium E2E、临时数据库 smoke、npm 33 文件清单和公开表面审计全部通过 |

`npm run audit:public` 会扫描 Git 已跟踪文件和未忽略候选文件，阻止常见 secret、敏感文件类型、个人工作区路径和未声明旧目录引用进入候选提交。

## 预期发行资产

同一个候选 SHA 应生成并公开以下六个文件：

1. `SUOWANG-Setup-0.2.0-beta.1.exe`
2. `SUOWANG-Portable-0.2.0-beta.1.zip`
3. `SUOWANG-0.2.0-beta.1-SHA256SUMS.txt`
4. `SUOWANG-0.2.0-beta.1-mac-arm64.dmg`
5. `SUOWANG-0.2.0-beta.1-mac-arm64-SHA256SUMS.txt`
6. `SUOWANG-0.2.0-beta.1-MIRROR-MANIFEST.txt`

镜像清单由聚合发布工作流从五个已验证候选文件现场生成，绑定版本、完整源 commit SHA 和每个文件的 SHA-256。第三方网盘只能原样复制 GitHub Release 资产，不得另行构建或改名后冒充同版本。

## 已完成的公开准备

- 应用版本、CLI、health、Windows/macOS 文件名已统一切换到 `0.2.0-beta.1`。
- README 第一屏优先解释产品、当前截图、Windows Setup 一键安装和本地数据边界；macOS、源码、npm/Agent、Tailscale 已下沉。
- GitHub 内容不包含求 Star、资助申请、赞助或开发者招募文案。
- 增加 `SECURITY.md`、Bug/使用反馈 Issue forms、第三方依赖声明和 Public Beta Release Notes。
- 发布工作流继续要求两个候选 run 来自同一个完整 SHA，不覆盖已有 Tag/Release/资产；Draft 集齐六项资产后才一次公开。

## Tag / Release 前必须完成

1. 提交并推送本轮候选，记录完整 40 位 SHA。
2. 等待该 SHA 的 Node 22/24 跨平台 CI、Chromium E2E、临时数据库 smoke、npm manifest 和公开表面审计全部通过。
3. 对同一 SHA 分别运行 Windows 与 macOS 候选工作流。
4. Windows 真机验证 Setup、桌面入口、Portable、从 `0.1.x` 升级、卸载后数据保留。
5. Apple Silicon Mac 真机验证 DMG 挂载、拖入 Applications、Control-打开、浏览器启动、升级后数据保留。
6. 复核两端 SHA-256 与候选 run provenance，保存不含个人数据的安装验收记录。
7. 在切换 Public 前启用 GitHub Private vulnerability reporting。
8. 只有以上全部完成，才输入 `INSTALL_VERIFIED` 运行聚合发布工作流。

## 结论

- 仓库当前是否已可安全切换为 Public：**PASS；历史邮箱披露已由仓库所有者接受，切换前还应启用 Private vulnerability reporting。**
- 当前是否可创建 `v0.2.0-beta.1`：**BLOCK，尚无最终 SHA 的远端门禁、双平台候选和真实安装升级证据。**
- 当前是否可继续做候选提交与 CI：**PASS。**
