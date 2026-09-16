<p align="center">
  <img src="docs/assets/brand-header.png" width="860" alt="所往 SUOWANG · 行有所往">
</p>

<p align="center"><strong>充分参与这一次人生。</strong><br>知所往 · 择其径 · 行其事。</p>

<p align="center"><a href="https://github.com/xhonye/suowang/releases">下载所往</a> · <a href="docs/beta-test-guide.md">使用指南</a> · <a href="https://github.com/xhonye/suowang/issues/new/choose">反馈问题</a></p>

所往是一个**本地优先的人生主线驾驶舱**。在恢复、工作、生活三个模式之间，选定当前主线，看清下一步；如果难以开始，就把它缩成更小的一步。

![所往驾驶舱，画面使用中性演示数据](docs/assets/suowang-0.2.0-beta.1-cockpit.png)

## 下载与开始

**Windows 推荐轻量版：**在[下载页](https://github.com/xhonye/suowang/releases)选择最新版本的 **SUOWANG-Lite-Setup** 安装包。

1. 双击安装，可勾选“创建桌面快捷方式”。
2. 安装完成后勾选“启动所往”，或双击桌面图标。
3. 所往会在默认浏览器打开，**不弹出命令行窗口，也不用安装 Node.js**。

关闭网页后，轻量后台仍在运行；下次点击图标继续使用，已保存的进度还在。启动失败时会弹出处理提示。

想要独立应用窗口，可选择 **Desktop Setup**。macOS 的 M1 及以后机型选择 **mac-arm64.dmg**，将应用拖入 Applications。免安装版本请完整解压后再运行。轻量版和桌面版共用数据，请不要同时打开。

当前为公开测试版，安装包尚未签名，macOS 尚未公证，首次打开可能需要系统确认。[安装帮助](docs/beta-test-guide.md)

## 把注意力放回眼前

- **恢复、工作、生活**：每种模式各自记住当前主线和下一步。
- **少量主线，明确取舍**：每种模式最多三条进行中的主线。
- **先迈出一步**：开始、暂停、今天完成；难以启动时，写下一个最小步骤。
- **留下行迹**：结束的主线与事项留在行迹中，没有连续打卡、积分或缺卡惩罚。

## 你的数据留在本机

无账号、无云同步、无遥测，也不依赖运行时 AI。数据自动保存在本机，卸载程序不会删除进度。

应用每天自动备份；重要数据仍请在设置中“导出 SQLite”，另存一份到其他设备。反馈时不要上传数据库、备份或私人事项。[备份与恢复](docs/operator-runbook.md)

## 从哪里开始

最初想做的，是让人在脑子很乱的时候，也能看清眼前的一步。

![所往项目起因的早期反馈，身份信息已经脱敏](docs/assets/origin-feedback-redacted.png)

![所往人生主线页面早期概念图](docs/assets/early-mainline-concept.png)

*上图记录最初的方向，使用概念占位内容，不代表当前界面。*

<details>
<summary>更多文档与源码运行</summary>

使用 Node 22 或 24 LTS，在项目目录运行 `npm install`、`npm start`，再打开 `http://127.0.0.1:2037/`。

[产品模型](docs/product-brief.md) · [架构](docs/architecture.md) · [本地运维与手机访问](docs/operator-runbook.md) · [版本记录](CHANGELOG.md) · [发行验收](PUBLIC_RELEASE_READINESS.md) · [安全报告](SECURITY.md)

</details>

[Apache License 2.0](LICENSE)
