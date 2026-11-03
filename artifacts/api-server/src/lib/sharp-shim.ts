import { createRequire } from "node:module";
import type SharpNS from "sharp";
import { logger } from "./logger";

/**
 * Loads `sharp` (the image library) only when an image command actually runs.
 *
 * `sharp` ships a native binary. On some devices (for example Termux on Android)
 * that binary cannot load. With a normal `import sharp from "sharp"` that would
 * crash the WHOLE bot at start-up. Through this shim the bot always starts, and
 * only the image commands that need sharp report a friendly error.
 *
 * Use it exactly like sharp:   import sharp from "../../sharp-shim";
 */
type SharpFn = typeof SharpNS;

const nodeRequire = createRequire(import.meta.url);
let real: SharpFn | null | undefined;

function load(): SharpFn {
  if (real === undefined) {
    try {
      real = nodeRequire("sharp") as SharpFn;
    } catch (err) {
      real = null;
      logger.warn(
        { reason: err instanceof Error ? err.message.split("\n")[0] : "unknown" },
        "sharp could not be loaded: image commands are disabled on this device",
      );
    }
  }
  if (!real) {
    throw new Error("Image tools are not available on this device (sharp could not be loaded).");
  }
  return real;
}

const sharp = ((...args: unknown[]) =>
  (load() as unknown as (...a: unknown[]) => unknown)(...args)) as unknown as SharpFn;

// Static members used by the bot (e.g. sharp.kernel.lanczos3).
Object.defineProperty(sharp, "kernel", { get: () => load().kernel, enumerable: true });

export default sharp;
