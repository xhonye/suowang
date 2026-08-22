from pathlib import Path

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "mainline-scene-work-v4-16-preview.webp"
OUTPUTS = {
    "restore": ROOT / "assets" / "mainline-scene-restore-v4.webp",
    "work": ROOT / "assets" / "mainline-scene-work-v4.webp",
    "life": ROOT / "assets" / "mainline-scene-life-v4.webp",
}


def arrow_masks(image: np.ndarray) -> list[np.ndarray]:
    height, width = image.shape[:2]
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    blue = cv2.inRange(hsv, np.array([85, 18, 80]), np.array([125, 255, 255]))
    blue[: int(height * 0.48), :] = 0

    regions = [
        (int(width * 0.13), int(width * 0.36)),
        (int(width * 0.40), int(width * 0.60)),
        (int(width * 0.64), int(width * 0.88)),
    ]
    masks = []
    for left, right in regions:
        region = np.zeros_like(blue)
        region[:, left:right] = 255
        candidates = cv2.bitwise_and(blue, region)
        count, labels, stats, _ = cv2.connectedComponentsWithStats(candidates, 8)
        if count < 2:
            raise SystemExit(f"Unable to isolate arrow in region {left}:{right}")
        largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        mask = np.where(labels == largest, 255, 0).astype(np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        mask = cv2.GaussianBlur(mask, (0, 0), 1.3)
        masks.append(mask.astype(np.float32) / 255.0)
    return masks


def build_state(image: np.ndarray, masks: list[np.ndarray], selected: int) -> np.ndarray:
    result = image.astype(np.float32)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV).astype(np.float32)

    muted_hsv = hsv.copy()
    muted_hsv[:, :, 1] *= 0.34
    muted_hsv[:, :, 2] = np.clip(muted_hsv[:, :, 2] * 1.02 + 4, 0, 255)
    muted = cv2.cvtColor(muted_hsv.astype(np.uint8), cv2.COLOR_HSV2BGR).astype(np.float32)

    active_hsv = hsv.copy()
    active_hsv[:, :, 0] = 103
    active_hsv[:, :, 1] = np.maximum(active_hsv[:, :, 1], 88)
    active_hsv[:, :, 2] = np.clip(active_hsv[:, :, 2] * 1.015, 0, 255)
    active = cv2.cvtColor(active_hsv.astype(np.uint8), cv2.COLOR_HSV2BGR).astype(np.float32)

    for index, mask in enumerate(masks):
        strength = 0.62 if index == selected else 0.74
        target = active if index == selected else muted
        alpha = (mask * strength)[:, :, None]
        result = result * (1 - alpha) + target * alpha
    return np.clip(result, 0, 255).astype(np.uint8)


def main() -> None:
    source = cv2.imread(str(SOURCE), cv2.IMREAD_COLOR)
    if source is None:
        raise SystemExit(f"Unable to read {SOURCE}")
    masks = arrow_masks(source)
    for selected, path in enumerate(OUTPUTS.values()):
        state = build_state(source, masks, selected)
        if not cv2.imwrite(str(path), state, [cv2.IMWRITE_WEBP_QUALITY, 94]):
            raise SystemExit(f"Unable to write {path}")
        print(f"wrote {path.relative_to(ROOT)} ({state.shape[1]}x{state.shape[0]})")


if __name__ == "__main__":
    main()
