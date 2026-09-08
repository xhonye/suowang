# 下一步行动中背景

用户要求：确认下一步卡不拉长的设计，并增加向右移动的斜纹，让正在做这件事的感觉更明确。

## 实现

- 保持原有紧凑卡片高度，剩余窗口空间继续留给事项列表。
- 已开始事项的背景层覆盖整张下一步卡片，含标题区；以 88px 图块组成三个箭头的窄组，每 4.2 秒从左到右快速掠过一次：约 0.9 秒移动，其余时间隐藏。使用 CSS transform，不引入计时器或业务状态。
- 用户最终选择多个单一蓝色填充的粗人字箭头块，不采用细线方案、双色描边或渐变闪光。箭头顶点及整个填充形状均处于图块横向边界内，避免尖端裁平。蓝色调整为更清楚的 `#b7d9ee`、整体不透明度 85%；标题和底部控件附近淡出。通过短促掠过与间隔留白平衡动感和阅读。文字、按钮及道路背景保持静止。
- 暂停／完成／离开该卡片时背景层随状态移除；刷新后跟随持久化行动中指针恢复；编辑字段时暂停流动；减少动态效果时隐藏并停止动画。
- 单色循环替代原有短促渐变出发动效，同时移除原出发动效的 900ms 重绘定时器。开始按钮使用播放三角图标；完成按钮与暂停按钮统一蓝色，默认不加计时。

## 验证

- 针对行动流程、持续运动、减少动态效果、响应式与长文本操作的 5 项浏览器检查通过。其中新增检查实际采样 transform 变化，并核对向右关键帧、卡片高度、按钮操作、编辑暂停、刷新恢复和完成后清除。
- 1920×1080、2560×1440、320px 三种宽度已真实渲染；前两者卡片高度一致。
- 语法检查与服务／批准道路基线定向测试通过。批准道路图片及历史视觉合同未改动。
- 新候选通过真实 Desktop packaged smoke 与安全扫描，高风险 blocker 为 0。
- 本地交互演示（虚构内容）：`test-results/priority-motion/preview.html`。验证日志：同目录 `e2e.log`、`journey-final.log`、`targeted.log`、`package.log`。初轮新增测试因展开后按钮名称变化而定位失败，已改为稳定控件定位并通过。

## 间歇掠过修订

用户反馈上一版太淡，改为每隔几秒一组蓝色粗箭头快速掠过。4 项浏览器检查与图块像素检查通过，实测快速段位移、间歇段透明且静止、卡片高度、暂停／编辑／减少动态效果；1920、2560、320px 已渲染。日志：`test-results/sweep-chevron/e2e.log`、`test-results/sweep-chevron/pattern.log`。候选通过 Desktop packaged smoke，用户关闭程序后已完成本机更新。EXE 与资源包先备份再替换，安装文件哈希与候选一致；实际安装通过隔离数据启动、数据库写入和四张道路解码检查。记录：`test-results/sweep-chevron/local-install.json`、`test-results/sweep-chevron/installed-smoke.json`。

## 低对比修订验证

用户反馈满卡粗箭头违和后，仅调整背景透明度、空间淡出与速度。行动流程、持续运动、减少动态效果、响应式共 4 项定向浏览器检查通过；1920×1080、2560×1440、320px 实际渲染已检查。日志：`test-results/calm-chevron/e2e.log`。候选通过 Desktop packaged smoke，打包后的三个界面文件与已测试源码逐字节一致。用户关闭应用后已更新本机，EXE 与资源包哈希一致，实际安装通过隔离数据启动、数据库写入和四张道路解码检查。更新前文件保留备份，可恢复。记录：`test-results/calm-chevron/local-install.json`、`test-results/calm-chevron/installed-smoke.json`；打包日志：`test-results/calm-chevron/package.log`。

## 本机安装

最新粗色块修订：102 项单元测试、12 项浏览器测试、语法与实际 Desktop packaged smoke 已通过；新增图块像素回归核对单一填充色、粗块宽度、向右形状与边界透明留白，浏览器检查背景确实覆盖标题区并保持卡片高度。日志：`test-results/solid-chevron/verify.log`、`test-results/solid-chevron/package.log`。用户关闭应用后，最新粗色块候选已更新到本机标准 Desktop 安装；EXE 与资源包先备份再替换，安装文件哈希与候选一致，实际安装的临时数据库隐藏窗口 smoke 通过。当前安装与备份记录：`test-results/solid-chevron/local-install.json`；实际安装检查：`test-results/solid-chevron/installed-smoke.json`。

2026-09-07 用户关闭应用后，已完成标准 Desktop 安装更新：仅替换 EXE 与资源包，原文件先备份并核对哈希；候选内 `src/app.js`、`src/styles.css`、`index.html` 与已测试源码逐字节一致。更新后的实际安装通过临时数据库隐藏窗口 smoke（renderer、数据库写入及四张道路资源解码全部通过）。原有桌面「所往 SUOWANG」入口继续有效。

本地安装与备份记录：`test-results/priority-motion/local-install.json`；实际安装验证结果：`test-results/priority-motion/installed-smoke.json`。未公开发行。
