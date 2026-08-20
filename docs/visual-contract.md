# SUOWANG Visual Contract

The concept image at `docs/assets/early-mainline-concept.png` is an early spatial reference for the first prototype at a `1672 × 941` desktop viewport. It is not implementation evidence. Its stable left rail is retained; placeholder branding, profile identity, membership badge, and peripheral controls are not requirements.

## Direction

The interface is a quiet morning navigation field: cool mist, a visible horizon, one road, and three translucent blue route ribbons. It should feel orienting rather than analytical.

## Tokens

- `ink` `#14233F`: headings and navigation.
- `signal-blue` `#2E73EE`: selected route and primary action.
- `blue-pale` `#E9F2FF`: active and explanatory surfaces.
- `muted` `#6D7890`: secondary copy.
- `signal-white` `rgba(255,255,255,.91)`: quiet glass surfaces.

Typography uses `Segoe UI Variable` / `Microsoft YaHei UI` throughout so Chinese and Latin text share the same restrained, modern rhythm. No web-font request is required.

## Signature

`Mainline Road` is the single expressive element. The arrows are rendered into the road photography rather than placed above it as icons. Arrowheads are broad and low, their tails follow the road surface toward the viewer, and asphalt texture remains visible through their glass-blue light. There is no SVG arrow, extracted black-field mask, cast shadow, or raised edge.

`assets/mainline-scene-neutral-v1.webp` is the locked scene master. The three selected-state images replace only a feathered road region from an edit of that master; sky, mountains, lake, framing, and non-selected routes remain master pixels. All four lossless WebP files share the same `1672 × 941` canvas and the page center-crops them together. They contain no text, people, logos, or private data; all product controls remain real HTML and CSS above them.

## Spatial memory

Desktop order is fixed: stable left rail, road, current-mainline context, timeline on the left, NOW on the right. Mobile collapses the rail into a compact top bar and changes content columns into a vertical sequence while preserving the same reading order.

Avoid dashboard grids, KPI decoration, RPG language, persistent chat, ornamental gradients outside the road scene, and more than three simultaneous route choices.
