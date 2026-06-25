/**
 * Build-time type stub for `mermaid`.
 *
 * mermaid (>=10) ships its own .d.ts that transitively references modern @types/d3
 * definitions using TypeScript 5.x syntax (e.g. `const` type parameters). This package's
 * d.ts generation runs on its pinned TypeScript 4.7.2, whose parser cannot read that
 * syntax — `skipLibCheck` only skips *checking*, not *parsing*. To keep declaration
 * generation working we redirect the `mermaid` type import (via tsconfig `paths`) to this
 * stub. It has no effect at runtime: Rollup resolves and bundles the real `mermaid`.
 */
declare const mermaid: any;
export default mermaid;
