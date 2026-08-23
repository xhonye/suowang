import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const approvedAssets = new Map([
  ["assets/mainline-scene-bright-office-v1-no-arrows-geometry-v5.png", "dc68ecea97bf8e1145459c64e1f772a90f896acf98a64540c68547e6fdf77bcb"],
  ["assets/mainline-scene-bright-office-v1-arrow-restore-light-v2.png", "76b42d194bae94128b55fb58bc5f67ab6955353b5dbeec829ee81cf389b609f1"],
  ["assets/mainline-scene-bright-office-v1-arrow-work-light-v4.png", "b325c84bfff85be4d087f6c47883e9f86bc5ed5df8710c5599e9a81e7268f5df"],
  ["assets/mainline-scene-bright-office-v1-arrow-life-light-v2.png", "38c3ce998d4ca301ae1499f1b5a3ae7cf564a1f7a941cef793e8d12288de65c4"],
]);

test("v0.1.0 approved visual assets remain byte-identical and full-canvas", async () => {
  for (const [relativePath, expectedHash] of approvedAssets) {
    const bytes = await readFile(path.join(projectRoot, relativePath));

    assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG", `${relativePath} must remain a PNG`);
    assert.equal(bytes.readUInt32BE(16), 2172, `${relativePath} width changed`);
    assert.equal(bytes.readUInt32BE(20), 724, `${relativePath} height changed`);

    const actualHash = createHash("sha256").update(bytes).digest("hex");
    assert.equal(
      actualHash,
      expectedHash,
      `${relativePath} changed; create a versioned candidate and require explicit user approval before updating the baseline`,
    );
  }
});
