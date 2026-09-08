# 所往 · 下一步（WidBar 个人试用）

常驻入口优先显示最小一步；点击后在原生卡片里切模式、编辑最小一步、开始／暂停、完成或换一件。没有下一步时可直接添加其他事项，不必先创建主线。持续事项沿用服务端的今天完成约束。

## 构建与安装

Windows x64，沿用本机已有 WidBar SDK 2.0.0 / Windows App SDK 2.2.0 和 Visual Studio DesktopBridge 构建环境。

```powershell
./integrations/widbar/build.ps1 -Register
```

注册后在 WidBar 的组件列表添加「所往 · 下一步」。组件宽 180 逻辑像素，卡片宽 340、高 370，内容超出时可滚动。卡片关闭由 WidBar 宿主管理。松散包依赖本目录的构建产物，移动源码后需要重新构建并注册；本轮不是公开发行包。

## 本地服务

使用与所往一致的默认数据目录规则；有歧义时要求通过 `SUOWANG_DATA_DIR` 明确指定。只读取实例锁，不打开数据库。通过锁 PID 查找 loopback TCP listener，并核对 `/health` 的应用名、数据库就绪状态和 PID，因此支持 Desktop 动态端口和 Lite 固定端口。HTTP 禁用代理和重定向。

未运行时点击「启动所往」，查找默认安装目录；自定义或 Portable 安装可设置 `SUOWANG_WIDGET_LAUNCHER` 为本机 exe 绝对路径，再重启组件。没有安装版时先手动打开所往。此配置仅保留本机，不进 Git。启动 Lite 可能同时打开浏览器，沿用它的现有启动行为。

展开时每 5 秒、收起时每 15 秒刷新，打开卡片和写入成功后立即刷新；输入最小一步期间暂停定时刷新。失败清空可操作旧状态，显示重试入口，不记录事项或 HTTP 正文到日志。所有写入等待服务端确认，不做乐观成功提示。

## 验证

```powershell
dotnet run --project integrations/widbar/tests/Tests.csproj
node integrations/widbar/tests/smoke.mjs
```

smoke 自动建立临时库和随机端口，验证真实服务发现、切模式、编辑、开始、暂停、一次完成和持续事项今天完成，结束后清理临时库。不会启动个人服务或写入个人库。

人工试用观察：是否自然看见下一步、是否推进真实事情、是否想隐藏入口。构建与接口测试不代表任务栏实际位置和点击体验已由用户验收。
