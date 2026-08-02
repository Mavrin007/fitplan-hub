// Minimal `Console` polyfill for sandboxed Node builds (e.g. WebContainer)
// that ship without `globalThis.Console` and without `node:console`.Console.
// Vitest / tinypool do `new Console({ stdout, stderr })` internally, so we
// provide a constructor that delegates every method to the global `console`.
/* eslint-disable no-undef */
if (typeof globalThis.Console === "undefined") {
  const base = globalThis.console || {};
  const METHODS = [
    "log", "info", "warn", "error", "debug", "trace", "dir", "time",
    "timeEnd", "timeLog", "group", "groupEnd", "groupCollapsed", "table",
    "count", "countReset", "assert", "clear", "profile", "profileEnd",
    "dirxml", "error", "exception",
  ];

  function Console(_stdoutOrOpts, _stderr) {
    // Invoked with `new`; methods are attached per-instance below.
  }

  for (const m of METHODS) {
    const fn = typeof base[m] === "function" ? base[m].bind(base) : () => {};
    Console.prototype[m] = fn;
  }

  globalThis.Console = Console;
}
