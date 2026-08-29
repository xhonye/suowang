所往 SUOWANG · macOS Apple Silicon 版

适用于 M1 及以后芯片的 Mac。
0.2.0-beta.2 是公开体验版本，可能仍有未发现的问题。升级或开始测试前，请先在“设置”中导出一份 SQLite 备份；不要把数据库或私人事项作为反馈附件发送。

1. 打开 SUOWANG-*-mac-arm64.dmg。
2. 将“所往 SUOWANG”拖入 Applications（应用程序）。
3. 双击“所往 SUOWANG”。

启动后会打开独立的「所往 SUOWANG」应用窗口，不会打开浏览器，也无需安装 Node.js、npm 或使用终端。
覆盖安装新版后继续使用同一个数据目录；实例锁会阻止两个入口同时打开同一数据库，不会结束未知程序。

首次打开测试版时，macOS 可能会阻止未知开发者应用：按住 Control 点击“所往 SUOWANG”并选择“打开”，再确认“打开”。

你的数据库、备份、头像和启动日志保存在：
~/Library/Application Support/SUOWANG/

卸载应用不会删除这些个人数据。可在所往的“设置”中导出或恢复数据。
自动备份与原数据库位于同一台 Mac，不等于异地灾备；重要数据请另外保存到另一设备或可信同步位置。

本测试版没有 Developer ID 签名或 notarization，不应把能通过 Control 点击打开描述成已经完成签名。启动失败时请提供 DMG 文件名、macOS 版本、错误提示和 latest-stderr.log；不要发送 suowang.db、备份或私人事项。
