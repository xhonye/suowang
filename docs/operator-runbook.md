# SUOWANG 本地运维手册

公开安装包只以 [GitHub Releases](https://github.com/xhonye/suowang/releases) 为准；本地 `package.json` 版本、分支构建或 `dist/` 文件都只是开发候选，不能冒充已发布资产。安装或升级前先从现有版本导出 SQLite，测试数据中不要放无法承受丢失的唯一副本。

## 首次安装

源码和 npm 的浏览器兼容入口只支持 Node 22 或 Node 24 LTS；Windows Setup/Portable 与 macOS `.dmg` 是自包含 Electron 桌面应用，不需要用户安装 Node。

### GitHub Release / 双击入口

Windows 从 Release 下载 `SUOWANG-Setup-*.exe` 后双击安装，再从桌面图标打开独立应用窗口。Portable ZIP 解压后双击 `SUOWANG.exe`。两种方式共用同一个 Forge packaged app，不打开浏览器，不读取或覆盖已有数据目录。

### macOS Apple Silicon / 双击入口

下载 `SUOWANG-*-mac-arm64.dmg`，将「所往 SUOWANG」拖入 Applications（应用程序）后双击打开独立应用窗口。仅支持 M1 及以后芯片的 Mac；应用内置 Electron 与 SQLite 依赖，不打开浏览器。未签名测试版第一次使用时，按住 Control 点击应用并选择“打开”，再确认一次。

### npm / Agent 入口

发布到 npm 后：

```powershell
npm install --ignore-scripts --global suowang@<version>
suowang install-shortcut
suowang
```

仅有私有 GitHub 仓库权限、npm 包尚未发布时：

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

Electron 桌面模式使用动态 loopback 端口且不向用户显示地址；源码/npm 浏览器兼容入口默认仍为 `http://127.0.0.1:2037/`。

手机访问使用 `suowang access tailscale` 启用，使用 `suowang access local` 关闭。设置保存在数据目录的 `access.json`，不进入仓库；环境变量可用于临时覆盖。再次双击桌面入口时，启动器会确认现有进程确实是 SUOWANG 后自动切换监听模式。远程模式不绑定 `0.0.0.0`，手机必须登录同一 Tailnet，并受 Tailscale ACL 与 Windows 防火墙共同约束。

## 冒烟检查

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:2037/health'
```

正常返回包含：

```json
{"status":"ok","app":"suowang","version":"<package.json version>","database":"ready","schemaVersion":7,"pid":12345,"accessMode":"local"}
```

实际 `version` 必须等于当前安装包的 `package.json` 版本；启动器据此决定复用还是安全切换旧服务。health 不会返回数据目录或事项内容。

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

1. 桌面应用先查看原生错误提示与数据目录 `logs/`；源码/npx 入口再确认 `node --version` 的主版本为 22 或 24，并检查 `/health`。
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

`release:check` 会运行单元、浏览器、动态端口临时 smoke、npm tarball 文件清单和公开表面审计；`verify:desktop` 另行运行 Electron E2E、Forge package、安全扫描和真实 packaged smoke。候选工作流只接受完整 commit SHA，在目标系统重建原生依赖并上传不可变 Actions artifact。完成 Windows/macOS 人工安装升级验收后，聚合发布工作流才允许用两个候选 run ID 和 `INSTALL_VERIFIED` 创建最终 Tag，生成绑定源 commit、Electron 版本、签名状态与全部候选文件 SHA-256 的镜像清单，并在 Draft Release 内集齐资产后一次性公开。不得对已公开版本覆盖资产。所有测试必须显式使用临时数据目录与非默认端口；确认 Git 中没有 `.db`、`.sqlite`、备份、日志、头像、导出、个人主线/事项或视觉探索归档。
