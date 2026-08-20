export type Severity = "error" | "warning" | "info";

export interface Position {
  /** 1-indexed */
  line: number;
  /** 1-indexed */
  column: number;
  endLine?: number;
  endColumn?: number;
}

export interface Diagnostic {
  rule: string;
  severity: Severity;
  message: string;
  position?: Position;
}

/** Maps character offsets to 1-indexed line/column positions. */
export class LineIndex {
  private readonly starts: number[] = [0];

  constructor(source: string) {
    for (let i = 0; i < source.length; i++) {
      if (source[i] === "\n") this.starts.push(i + 1);
    }
  }

  at(offset: number): { line: number; column: number } {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - this.starts[lo]! + 1 };
  }
}

export function countBySeverity(diagnostics: readonly Diagnostic[]): {
  error: number;
  warning: number;
  info: number;
} {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const d of diagnostics) counts[d.severity]++;
  return counts;
}
