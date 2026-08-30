# SUOWANG Public Release Readiness Contract

本文件是长期发行闸门，不是某个本地分支的实时状态看板。当前公开版本、资产和发布时间只以 [GitHub Releases](https://github.com/xhonye/suowang/releases) 为准；`package.json`、本地 `dist/`、Actions artifact 或测试通过都不能单独证明版本已经发布。

## 证据等级

| 等级 | 含义 |
|---|---|
| `CI-VERIFIED` | 精确 commit SHA 的单元、浏览器、桌面、安全与临时数据库门禁在远端通过 |
| `PACKAGE-BUILT` | Windows 与 macOS 候选资产由同一 SHA 在目标平台构建，并附可复验 SHA-256 |
| `INSTALL-VERIFIED` | 在真实 Windows / Apple Silicon Mac 完成安装、启动、升级、退出、卸载与数据保留验收 |
| `RELEASE-VERIFIED` | 不可移动 Tag 指向候选 SHA，Draft 已集齐并复验全部资产，随后一次性公开 |

低等级不得冒充高等级。本地构建成功只能算本地 `PACKAGE-BUILT`；packaged smoke 不能替代真实安装验收；公开 Release 页面出现前不得把候选文件称为正式发布资产。

## 公开前硬门槛

1. 版本来自 `package.json`，候选工作区干净，构建输入是完整 40 位 commit SHA。
2. 核心 CI、Chromium E2E、临时数据库 smoke、npm 清单、公开表面审计和运行时依赖审计全部通过。构建依赖同时运行 `audit:build`；未知告警必须阻断，任何已审查例外必须限定为开发依赖、精确版本与到期日，不能写成“已修复”。
3. Windows 与 macOS 候选工作流使用同一 SHA；安装包、Portable/DMG、校验文件和签名状态均来自各自目标平台。
4. Windows 的 Lite 与 Desktop 均验收 Setup、桌面快捷方式、Portable、旧库升级、卸载与数据保留；Lite 额外验证 GUI 子系统、无可见命令窗口与默认浏览器服务，Desktop 额外验证独立 renderer 和单实例。macOS 验收 DMG 挂载、Applications 拖放、首次打开、升级、退出和无残留进程。
5. 候选未签名时如实标记 `UNSIGNED`，不得使用自签名证书冒充可信发布者；只有实际完成 Apple notarization 才能写 `SIGNED+NOTARIZED`。
6. 人工验收后，聚合流程核对同 SHA、同仓库 main 的完整 CI 和双平台候选运行（校验 workflow 路径与事件），下载精确 artifact、复验 SHA-256、创建不可移动 annotated Tag，并在 Draft 中集齐资产、重新下载逐字节比对后一次性公开。
7. 已存在的 Tag、Release 或同名资产必须使流程失败；禁止 `--clobber` 已公开资产。

## 公开资产合同

同一版本的公开 Release 应包含：

1. `SUOWANG-Lite-Setup-<version>.exe`
2. `SUOWANG-Lite-Portable-<version>.zip`
3. `SUOWANG-Desktop-Setup-<version>.exe`
4. `SUOWANG-Desktop-Portable-<version>.zip`
5. `SUOWANG-<version>-Windows-SHA256SUMS.txt`
6. `SUOWANG-<version>-mac-arm64.dmg`
7. `SUOWANG-<version>-mac-arm64-SHA256SUMS.txt`
8. `SUOWANG-<version>-MIRROR-MANIFEST.txt`

`SIGNING-STATUS.txt` 供聚合流程读取，不作为公开资产。第三方网盘只能镜像 GitHub Release 中同名且 SHA-256 完全一致的文件。

## 停止条件

以下任一情况都必须停止发布：工作区含未审查改动、候选 SHA 不一致、任一平台构建或安装验收失败、校验和不匹配、数据库升级/恢复证据缺失、签名状态不明、Tag 或 Release 已存在。

发行脚本和现场步骤见 `docs/operator-runbook.md`；桌面壳验收边界见 `DESKTOP_SHELL_READINESS.md`。
