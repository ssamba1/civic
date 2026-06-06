// Registers vitest's ambient test globals (describe/it/expect/vi/...) for the
// type-checker. vitest.config.ts sets `globals: true` (runtime injection); this
// file is the compile-time counterpart so `tsc --noEmit` and `next build`
// resolve those names in *.test.ts without adding "vitest/globals" to the
// (externally-owned) tsconfig `types` array.
/// <reference types="vitest/globals" />
