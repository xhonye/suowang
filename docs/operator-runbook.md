# SUOWANG 本地运维手册

公开安装包只以 [GitHub Releases](https://github.com/xhonye/suowang/releases) 为准；单独凭本地 `package.json` 版本、分支构建或 `dist/` 文件不能证明已经发布。从 Release 下载的本地副本或镜像必须与公开附件同名且 SHA-256 一致。安装或升级前先从现有版本导出 SQLite，测试数据中不要放无法承受丢失的唯一副本。

## 首次安装

源码和 npm 的浏览器兼容入口只支持 Node 22 或 Node 24 LTS；Windows Lite、Windows Desktop 与 macOS `.dmg` 都是自包含发行物，不需要用户安装 Node。

### GitHub Release / 双击入口

Windows 普通用户下载 `SUOWANG-Lite-Setup-*.exe`，桌面快捷方式直指 `SUOWANG-Lite.exe`。这个原生 GUI 启动器以隐藏窗口方式调用系统 PowerShell，再使用包内已校验的 Node 启动本地服务并在默认浏览器打开；用户不会看到命令窗口，也不需要安装 Node。需要独立窗口时可选择 `SUOWANG-Desktop-Setup-*.exe`，快捷方式直指 Forge packaged `SUOWANG.exe`。

两版安装身份、目录和快捷方式互不覆盖，但共用同一个业务数据目录与实例锁，不得同时运行。Portable ZIP 解压后分别双击 `SUOWANG-Lite.exe` 或 `SUOWANG.exe`；不要在压缩包内直接运行。

### macOS Apple Silicon / 双击入口

下载 `SUOWANG-*-mac-arm64.dmg`，将「所往 SUOWANG」拖入 Applications（应用程序）后双击打开独立应用窗口。仅支持 M1 及以后芯片的 Mac；应用内置 Electron 与 SQLite 依赖，不打开浏览器。未签名测试版第一次使用时，按住 Control 点击应用并选择“打开”，再确认一次。

### npm / Agent 入口

发布到 npm 后：

```powershell
npm install --ignore-scripts --global suowang@<version>
suowang install-shortcut
suowang
```

npm 包尚未发布时，可从公开 GitHub 仓库的指定 Tag 安装；不需要私有仓库权限，但仍需 Node 22/24、npm 与 Git。这是开发者入口，不是普通用户的安装步骤：

```powershell
npm install --ignore-scripts --global github:xhonye/suowang#v<version>
suowang install-shortcut
```

### 源码入口

```powershell
Set-Location -LiteralPath '<path-to-suowang>'
npm install
npm run install-shortcut
```

日常双击桌面 `SUOWANG` 或仓库根目录的 `SUOWANG.cmd`。这是浏览器兼容入口，不等同于 Release 的桌面应用。它会从统一配置读取预期版本、端口、数据目录和访问模式；其他入口已经持有该数据目录实例锁时停止并报错，不会误杀进程。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `SUOWANG_DATA_DIR` | Windows 新安装为 `%LOCALAPPDATA%/SUOWANG`；macOS 为 `~/Library/Application Support/SUOWANG/`；Linux 为 XDG 或标准 home 数据目录 | 必须是绝对路径并始终优先；保存数据库、备份、头像、访问配置和日志 |
| `SUOWANG_PORT` | `2037` | 本地开发服务端口，范围 1–65535 |
| `SUOWANG_ACCESS` | `local` | `tailscale` 时保留本机监听，并额外绑定自动发现的 Tailscale IPv4 |
| `SUOWANG_TAILSCALE_IP` | 自动发现 | 仅在机器存在多个 Tailscale IPv4 时显式指定；必须属于本机 `100.64.0.0/10` |

Windows 旧版若已经存在 `D:/5Data/suowang/suowang.db`，会继续使用旧目录且不自动搬迁。若旧目录与 `%LOCALAPPDATA%/SUOWANG` 同时存在数据库，启动会停止并列出两个路径；设置 `SUOWANG_DATA_DIR` 明确选择后再启动，禁止手工合并运行中的数据库。

Electron 桌面模式使用动态 loopback 端口且不向用户显示地址；Windows Lite 与源码/npm 浏览器兼容入口默认使用 `http://127.0.0.1:2037/`。

手机访问使用 `suowang access tailscale` 启用，使用 `suowang access local` 关闭。设置保存在数据目录的 `access.json`，不进入仓库；环境变量可用于临时覆盖。再次双击桌面入口时，启动器会确认现有进程确实是 SUOWANG 后自动切换监听模式。远程模式不绑定 `0.0.0.0`，手机必须登录同一 Tailnet，并受 Tailscale ACL 与 Windows 防火墙共同约束。

## 冒烟检查

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:2037/health'
```

正常返回包含：

```json
{"status":"ok","app":"suowang","version":"<package.json version>","database":"ready","schemaVersion":7,"pid":12345,"accessMode":"local"}
```

实际 `version` 必须等于当前安装包的 `package.json` 版本；启动器还必须确认当前安装的 Node、精确服务入口、端口 PID 和当前数据目录实例锁，不能仅凭 health 复用。锁缺失或属于其他目录／安装时，请先退出原入口再启动；程序不会猜测或终止身份不明的进程。health 不会返回数据目录或事项内容。

新安装的 Windows 数据库默认为 `%LOCALAPPDATA%/SUOWANG/suowang.db`；既有旧数据库继续留在 `D:/5Data/suowang/suowang.db`。不要手工编辑、复制运行中的数据库或把它放进仓库；使用设置页的 SQLite 导出取得一致性副本。

升级现有安装后首次启动会自动运行未应用的 migration。持续事项完成记录保存在同一个 SQLite 数据库中，随每日备份、SQLite 导出和整库恢复一起保存；无需创建额外数据文件。

## 备份与恢复

- 每天第一次启动自动备份，位于数据目录的 `backups/`，滚动保留 30 份。备份先写同目录临时文件，通过 SQLite 完整性与外键检查后才替换正式文件；既有当日备份也会验证，无效时安全重建。
- 已存在数据库升级 schema 前会创建 `pre-migrate-v*-to-v*-*.db` 完整快照；它不参与每日 30 份清理。迁移任一步或完整性检查失败时，整个升级回滚。
- 设置页的“导出 SQLite”生成可恢复完整备份；“导出 JSON”只用于阅读，不可恢复。
- 整库恢复会验证来源文件、先备份当前库，再整体替换；不会 merge。
- 恢复前确认选择的是 SUOWANG SQLite 导出，并避免同时打开多个手工启动的服务进程。
- 自动备份与原库通常仍在同一台设备；硬盘损坏、系统盘丢失或整机遗失时可能一起消失，因此它不等于异地灾备。重要数据请定期把“导出 SQLite”保存到另一设备或可信同步位置。

## 故障定位

双击入口失败时，错误窗口会给出阶段、原因、退出码、日志位置和下一步。启动日志在数据目录的 `logs/`。

按下面顺序检查：

1. Windows Lite 先查看启动错误提示和数据目录 `logs/`；Desktop 先查看原生错误提示；只有源码/npm 入口需要确认 `node --version` 的主版本为 22 或 24。
2. 源码浏览器模式的 2037 端口是否被其他程序占用；桌面动态端口不依赖 2037。
3. 数据目录是否可写，数据库或备份盘是否有空间。
4. macOS 启动失败时检查 `~/Library/Application Support/SUOWANG/logs/latest-stderr.log`。
5. 在仓库根目录运行 `npm run check`，确认代码与测试未损坏。

若源码浏览器模式健康检查正常但页面未更新，先确认 `/health` 的 `version` 是否为当前版本。桌面应用若提示数据目录已被占用，应正常退出另一个 SUOWANG 入口；不要按端口号盲目结束进程。

## 发布前检查

```powershell
Set-Location -LiteralPath '<path-to-suowang>'
npm run check
npm run test:e2e
npm run verify
npm run smoke:temp
npm run test:desktop
npm run verify:desktop
npm run release:check
git diff --check
git status --short
```

`release:check` 会运行单元、浏览器、动态端口临时 smoke、npm 清单、公开表面及生产／构建依赖审计；`verify:desktop` 另行运行 Electron E2E、Forge package、安全扫描和真实 packaged smoke。自动桌面启动必须显式使用临时 `SUOWANG_DATA_DIR`，Chromium profile 也放在该临时目录；不得复用个人配置。构建依赖的限时风险审查见 `security-review-beta.3.md`，已知告警仍须显式报告。

Windows 候选同时验证 Lite/Desktop 的 Setup、Portable、真实快捷方式、无可见命令窗口、视觉资产、受控旧库升级和卸载保留数据。安装／卸载测试会修改安装注册信息，应在一次性 CI runner 或测试机执行，不在日常使用的个人安装上跑。

候选工作流只接受完整 commit SHA，并上传不可变 Actions artifact。完成 Windows/macOS 人工安装升级验收后，向聚合流程提供 `sha`、`core_ci_run_id`、`windows_run_id`、`macos_run_id`、`install_evidence` 和 `confirmation=INSTALL_VERIFIED`；它核对同 SHA 的 main CI 与两平台构建，并在 Draft 内集齐、重新下载比对全部资产后才公开。不得伪填人工验收证据，不得覆盖已公开资产。确认 Git 中没有私人数据库、备份、日志、头像、导出或未脱敏截图。
