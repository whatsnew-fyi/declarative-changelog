// Test harness only: pins "now" for a child process, so the dates a release
// tool stamps on a new release are the same on every run.
const fixed = Date.parse(process.env.FAKE_NOW);
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : [fixed]));
  }
  static now() {
    return fixed;
  }
};
