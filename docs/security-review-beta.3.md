# Beta.3 发布前安全复核

审查日期：2026-08-30。范围是本地 HTTP、Lite 启动器、Electron 权限、数据备份、依赖供应链与 GitHub 发布流程；不改变产品模型、数据库 schema 或批准视觉资产。这不是渗透测试证书，也不代表未知漏洞为零。

## 本轮修复

| 问题 | 处理与回归 |
|---|---|
| 相同 health 可让 Lite 复用其他目录的服务 | 复用、切换前同时验证 Node 路径、精确脚本参数、监听 PID 与当前数据目录锁；停止前再比对 token 和进程创建时间。`launcher-policy.test.mjs`、`launcher-process.test.mjs` 覆盖伪装、缺锁、错目录、错运行时和宽泛监听。 |
| 聚合发布没有强制核对完整 CI | 增加 `core_ci_run_id`，核对同 SHA、同仓库 main、workflow 路径、名称、事件及成功结束状态；测试拒绝失败 CI、其他 SHA、分支和伪装 workflow。 |
| Draft 只验证了附件名称 | 发布前重新下载八个附件，与候选逐字节比较；不匹配时保持 Draft，不公开。 |
| 同毫秒导出或恢复前备份可能重名 | 每次操作使用 UUID；测试保留两次同时间导出及两个独立恢复前副本。 |
| 自动桌面启动仍使用个人 Chromium 配置 | 测试与 smoke 必须显式提供临时数据目录，并在获取应用实例锁前隔离 userData/sessionData。 |
| 运行时下载验证未完全约束最终输入 | Forge 使用锁定 Electron 包附带的官方校验和；Lite 每次从已校验 Node 压缩包重新解压，不信任残留解压目录。 |
| 文档提前称候选为公开版 | README 改以真实 Releases 为准；工程候选、自动化通过和人工验收分开表述。 |

## 已保留并检查的边界

- 默认 loopback；仅显式启用的 Tailscale 地址可额外监听，不绑定 `0.0.0.0`。
- Host 白名单、同源 Origin、JSON 类型与上传大小限制、静态文件白名单、CSP。
- Electron renderer 无 Node／文件系统／shell 权限，sandbox、context isolation、webSecurity 与 ASAR fuses 保持开启；外链只接受固定 GitHub 目标。
- 同数据目录实例锁、迁移前备份、SQLite 完整性与外键检查、SUOWANG 备份语义校验保持启用。
- 安装器按用户安装，不要求管理员权限，不删除仓库外业务数据。
- 仓库密钥扫描和推送保护在本轮开启并回读确认；私密漏洞报告入口已开启。扫描结果是时间点证据，不能保证扫描覆盖一切秘密。

## 尚未修复的上游构建依赖告警

2026-08-30 的全量 `npm audit` 报告了 22 个 high 依赖节点，但它们来自以下两个包的三份 advisory，而不是 22 个独立运行时漏洞。生产依赖审计为零。以下均为**尚未修复、受约束的构建风险**：

- `extract-zip@2.0.1`：[符号链接路径越界](https://github.com/advisories/GHSA-jmr9-qjv8-65gv)。仅由 Forge packager 解压 Electron；现固定使用锁定 Electron 包中的官方 archive SHA-256，含缓存的下载必须先通过验证。不得向 packager 输入任意 ZIP 或绕过校验。
- `image-size@0.7.5`：[ICNS 无限循环](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr)、[JXL/HEIF 无限循环](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq)。仅在 macOS DMG 构建依赖链中，输入为仓库内审查并生成的品牌资产，不处理用户上传图片或远程图片。不得在发布作业中换成未审查图片。

审查时 npm registry 和 advisory 未提供可直接升级的修复版本。没有执行 `npm audit fix --force`、换未知第三方 fork 或修改上游代码来伪造零告警。

`npm run audit:build` 对完整依赖图做门禁：只接受上述 advisory URL、精确版本且全部节点必须是 dev dependency；新的告警、运行时依赖、未知结果或审查到期都会失败。此例外在 **2026-09-30** 到期，必须重新确认修复版本与输入边界。告警仍输出到 CI。Desktop 实际 ASAR 校验禁止这些构建工具文件进入用户包；Lite 使用固定运行时依赖复制清单。

这些约束降低现有构建路径的可利用性，但不等同于修复上游漏洞，也不保护已被控制的维护者机器或构建账号。

## 复核与发布门槛

运行 `npm run release:check`、`npm run verify:desktop`，在同一新 SHA 上重新完成跨平台 CI、Lite/Desktop 安装包与 macOS DMG 候选验证，并复核实际资产 SHA-256。安装／卸载自动化在一次性 runner 执行，不覆盖日常安装注册信息。

人工 Windows／Apple Silicon 安装升级、未签名首次打开与退出体验仍是独立门槛。自动 smoke、绿色 CI 或本报告不能代替人工结果；没有对应证据，不应填 `INSTALL_VERIFIED` 或发布最终 Tag。未签名／未公证与缺少异地备份的限制保持如实告知。
