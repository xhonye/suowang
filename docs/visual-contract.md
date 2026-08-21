# SUOWANG Visual Contract

## 视觉目标

界面像清晨打开的一张本地导航图：空气安静、地平线可见、方向明确。道路负责表达，控件负责工作，两者不能争抢注意力。

## Token

- `horizon #DCE9EE`：道路周围的冷雾环境。
- `fog #F2F6F5`：应用底色。
- `paper #FBFCFA`：稳定内容面。
- `asphalt #253845`：主文字与道路语义。
- `signal #4E839C`：当前状态、Current、Priority 和焦点。
- `signal-soft #DCEBF0`：选中与解释性背景。
- `ink #1B2B33`：正文。
- `muted #6C7B80`：次要信息。

中文正文使用系统内置 `Microsoft YaHei UI`，标题优先 `Segoe UI Variable Display`，日期和微型状态标签使用 `Bahnschrift`。不加载网络字体。

## 单一签名元素

`assets/mainline-scene-neutral-v1.webp` 是锁定的三岔道路母图。三张状态图只高亮一条道路：

- `mainline-scene-restore-v1.webp`：左路 / 恢复
- `mainline-scene-work-v1.webp`：中路 / 工作
- `mainline-scene-life-v1.webp`：右路 / 生活

状态切换只做 150–250ms 的淡入。道路下方用一条细灰蓝方向线把 Current 主线槽与 Priority 连接起来。大胆表达只发生在这里；其他卡片不增加装饰性渐变或漂浮动画。

## 空间合同

桌面端左栏固定约 196px，顶栏约 64px。主内容最大宽度约 1780px，大屏增加留白而非无限拉宽。

驾驶舱纵向顺序固定为状态 Tab、道路、主线槽、Current 详情、Priority、Todo 双栏。道路约占内容高度 20%–25%。1920×1080 与 2560×1440 不产生驾驶舱页面滚动，Todo 长列表只在各自列表内部滚动。

320px 下左栏变为底部三页导航，双栏垂直排列。信息阅读顺序不变，允许页面滚动，但不允许横向溢出。

## 克制规则

- 三状态共享一套灰蓝系统，不使用绿/蓝/橙三套主题色。
- 不显示假统计、窗口装饰、会员徽章、通知、专注计时或励志堆叠。
- 重要状态不能只依赖颜色；Current、选中、完成和禁用均有文字或形状信号。
- 保留明显键盘焦点并尊重 `prefers-reduced-motion`。
- 空状态告诉用户下一步，不用情绪化文案填空。
