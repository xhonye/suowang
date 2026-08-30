# SUOWANG Desktop Shell Acceptance Contract

本文件定义 Windows Desktop 与 macOS Electron 桌面壳的长期验收标准，不记录某个本地候选的临时 PASS/BLOCK。Electron 只承担独立窗口与系统集成；页面、Node HTTP 服务、migration 和 SQLite 真源必须继续与浏览器兼容入口共用。

Windows Lite 使用默认浏览器，不适用下文关于独立窗口、BrowserWindow 或 ASAR 的要求；其无可见命令窗口、安装升级、真实快捷方式与数据保留门槛见 [公开发行合同](PUBLIC_RELEASE_READINESS.md)。不能用本文件要求给 Lite 增加 Electron，也不能以轻量版为由省略通用发行门禁。

## 用户体验

- 桌面图标直接打开「所往 SUOWANG」独立窗口，没有 PowerShell、终端、浏览器地址栏或 `127.0.0.1`。
- 第二次启动只恢复并聚焦原窗口；正常退出后不残留持有数据库的主进程或 helper。
- Windows Desktop Setup 与 Desktop Portable ZIP 复用同一 packaged app；macOS `.app` 使用同一源码版本的目标平台构建。升级保留用户数据库、备份、头像、设置和窗口状态。
- 1920×1080、2560×1440、矮窗/RDP 与 320px 布局都可到达全部功能；大窗口只让事项列表吸收余高，下一步不被拉成长面板。
- 道路底图、三张箭头层和左侧品牌图必须实际进入 `app.asar` 并能在真实 renderer 中解码；页面启动成功不能替代视觉资产验收。

## 安全与进程边界

- renderer 保持 `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`、`webSecurity: true`，不获得文件系统、shell、数据库、任意路径或原始 IPC。
- BrowserWindow 只加载本次启动得到的精确 loopback origin；导航、新窗口和权限默认拒绝，系统浏览器只接受固定 GitHub 目标。
- 生产包启用 ASAR、native auto-unpack、ASAR integrity 与安全 fuses；高风险桌面审计结果为零。
- 桌面模式使用动态 loopback 端口且离线可完整启动；无遥测、更新检查、远程代码或启动期外网依赖。
- 所有入口使用同一仓库外数据目录实例锁，不按端口盲目终止身份不明的进程。

## 候选验证

本地工程检查至少运行：

```powershell
npm run release:check
npm run test:desktop
npm run verify:desktop
```

Windows 候选还要验证 Setup 安装、桌面快捷方式、Portable、受控旧库升级、卸载和数据保留；macOS 候选要验证最终 DMG 挂载、Applications 拖放、首次打开、升级和无残留进程。packaged smoke 只证明候选内部可启动，不等于陌生用户安装验收。

Electron、Chromium、Node、Forge、SQLite 驱动和测试工具的精确版本以 `package-lock.json` 与候选报告为准，不在本文件复制易过期的数字。

## 汇报规则

汇报必须分别写 `CI-VERIFIED`、`PACKAGE-BUILT`、`INSTALL-VERIFIED` 和 `RELEASE-VERIFIED`。未完成的级别明确写“未验证”，不得用“桌面版完成”“可以发布”等总括句掩盖缺口。公开发行总闸门见 `PUBLIC_RELEASE_READINESS.md`。
