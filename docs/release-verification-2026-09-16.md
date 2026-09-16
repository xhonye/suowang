# Beta.8 发行验证

本轮由维护者委托 Agent 测试，并在通过后发布。以下区分自动化证据和 Agent 界面观察，不冒认维护者本人在 Windows/macOS 完成了手工验收。

候选提交：`d7afd0673354cb3e27e21b214cfd3b194d29ad09`。版本：`0.2.0-beta.8`。

## 自动化结果

- [跨平台 CI](https://github.com/xhonye/suowang/actions/runs/35048879526)：Windows、macOS、Linux 的 Node 22/24 检查、Chromium 浏览器流程、双平台桌面测试与公开内容审计全部通过。
- [Windows 候选](https://github.com/xhonye/suowang/actions/runs/35048892090)：Lite/Desktop 安装版与免安装版由同一提交构建；快捷方式、实例复用、升级、退出及卸载保留数据检查通过。Lite 六条入口/恢复检查的可见命令窗口均为 0。
- [macOS 候选](https://github.com/xhonye/suowang/actions/runs/35048894555)：Apple Silicon DMG 挂载、安装副本启动、旧库升至 schema 9、数据保留和退出无残留通过。
- 两端实际安装截图均由 Agent 查看，道路与箭头资产完整，升级 fixture 的旧主线和事项存在。受保护视觉资产哈希不变。
- 运行时依赖审计为零；构建工具仍有已记录、精确版本限定并于 2026-09-30 到期的上游风险，见[安全复核](security-review-beta.3.md)。未把例外称为上游漏洞已修复。

## 本机候选交互观察

下载 Windows artifact 后核对全部 SHA-256，在独立临时安装目录、临时数据库和非默认端口验收轻量版。已观察安装向导中的桌面快捷方式勾选项、正确的原生 EXE 快捷方式、安装后默认浏览器窗口与 healthy 服务。

通过实际网页添加中性验收事项，执行开始和今天完成。重复快捷方式启动复用同一服务；停止并从快捷方式重新启动后，网页仍显示原事项、今天已完成和累计 1 天。卸载隔离安装后测试数据库仍存在，没有使用个人数据库。

安装向导观察期间检测到本机交互，随后安装窗口已结束并出现默认浏览器；因此不将整个向导每一步都描述成 Agent 点击。首次 SmartScreen/Gatekeeper 体验没有在全新用户设备复现，保留未签名／未公证提示。

## GitHub 首页

新增沿用既有山水道路 Logo 的品牌大字横幅。精简下载、使用与数据说明；原有驾驶舱、项目起因、早期概念三张图片均保留在首页，文件逐字节未变。Agent 已在实际 GitHub 页面查看横幅与排版。

## 发布追溯

[聚合发布流程](https://github.com/xhonye/suowang/actions/runs/35049943305)负责校验同 SHA 来源、下载精确候选、核对校验和、创建不可移动 Tag，在 Draft 集齐八个附件并重新下载逐字节比对后公开。公开状态以该流程结果和 [beta.8 Release](https://github.com/xhonye/suowang/releases/tag/v0.2.0-beta.8) 为准。
