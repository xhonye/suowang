# SUOWANG Visual Milestone · 2026-08-23

本阶段固定了道路箭头素材的四个层次，全部保持 2172×724 画布：

- `base-no-arrows-v1.png`：去箭头底图，后续叠加层的基础。
- `base-with-white-arrows-v1.png`：原始批准底图，保留白色箭头。
- `generation-base-selected-v2.png`：最终成功生图链路使用的有色结构基座，也是发布仓库内保留的生成基座。原始探索文件只留在本地忽略归档。
- `base-with-arrows-linework-v1.png`：历史审阅副本，不作为生图输入。
- `arrow-restore-light-v1.png` / `arrow-work-light-v1.png` / `arrow-life-light-v1.png`：三个独立浅蓝半透明箭头层。
- `arrow-work-light-v2.png`：在 V2 原坐标和边界框内规则化头部后的当前工作箭头。
- `arrow-work-mask-clean-v1.png`：工作箭头的干净几何参考；只用于修边，位置仍以批准箭头的 alpha 边界框为准。

底图与箭头层分离保存，禁止把带箭头底图再次作为无箭头底图使用。

溯源依据：里程碑中的 `generation-base-selected-v2.png` 于 07:23 形成，随后批量结果命名为 `mainline-scene-linework-v2-natural-*`，最终在 08:03 形成 `mainline-scene-bright-office-v1..v5`。此前临时生成的全景边缘检测图不作为生图输入。

当前交互基准为 `docs/visual-final-preview.html`。这套 2172×724 底图与透明箭头层已经接入正式应用；桌面快捷方式仍通过 `scripts/start.ps1` 打开正式页面。
