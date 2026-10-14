import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The workflows run the CLI by exact version. A release must move every pin
 * with it, or a copied template runs last release's normalize.
 */
const root = fileURLToPath(new URL("..", import.meta.url));
const { version } = JSON.parse(readFileSync(join(root, "..", "package.json"), "utf8"));

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === "golden") return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

describe("pins", () => {
  it("names the version this repository is at, everywhere a template runs the CLI", () => {
    const pins = files(root).flatMap((path) =>
      [...readFileSync(path, "utf8").matchAll(/declarative-changelog@(\d+\.\d+\.\d+)/g)].map(
        (match) => `${relative(root, path)} ${match[1]}`,
      ),
    );
    expect(pins.length).toBeGreaterThan(0);
    expect(pins.filter((pin) => !pin.endsWith(` ${version}`))).toEqual([]);
  });
});
