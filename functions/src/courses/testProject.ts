/**
 * Emulator project id for a test file. Two vitest processes (or two workers) sharing one emulator would otherwise
 * clean each other's collections; the pool id separates workers of one run and the pid separates runs.
 */
export const testProjectId = (base: string): string => `${base}-${process.env.VITEST_POOL_ID ?? "0"}-${process.pid}`;
