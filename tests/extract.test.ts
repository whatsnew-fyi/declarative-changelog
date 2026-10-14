import { describe, expect, it } from "vitest";
import { extractEntry } from "../src/extract.js";
import { doc } from "./helpers.js";

const SOURCE = doc(`## [2.0.0](https://kestrel.example/r/2.0.0) — 2026-10-14T09:30:00Z (yanked)

### Fixed

- Pulled.

## [1.9.0](https://kestrel.example/r/1.9.0) — 2026-10-01T09:30:00Z

\`\`\`changelog
channel: lts
\`\`\`

> Faster uploads.

### Added

- Retries for flaky uploads.

\`\`\`sh
## not a heading
\`\`\`

## 1.8.0 — 2026-09-01T09:30:00Z

### Fixed

- A fix.

[1.8.0]: https://kestrel.example/r/1.8.0`);

describe("extractEntry", () => {
  it("takes latest as the newest entry that is not yanked, without its hatch", () => {
    const entry = extractEntry(SOURCE, "latest");
    expect(entry?.version).toBe("1.9.0");
    expect(entry?.heading).toBe("[1.9.0](https://kestrel.example/r/1.9.0) — 2026-10-01T09:30:00Z");
    expect(entry?.markdown).toBe(
      "> Faster uploads.\n\n### Added\n\n- Retries for flaky uploads.\n\n```sh\n## not a heading\n```",
    );
  });

  it("finds a version with or without its v, and leaves the file's link definitions out", () => {
    expect(extractEntry(SOURCE, "v1.8.0")?.markdown).toBe("### Fixed\n\n- A fix.");
    expect(extractEntry(SOURCE, "2.0.0")?.markdown).toBe("### Fixed\n\n- Pulled.");
  });

  it("answers nothing for a version it does not hold", () => {
    expect(extractEntry(SOURCE, "3.0.0")).toBeUndefined();
    expect(extractEntry(doc("No entries."), "latest")).toBeUndefined();
  });
});
