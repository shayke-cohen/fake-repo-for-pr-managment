// A deliberately boring module. Its only job is to give pull requests
// something to conflict over.
export const VERSION = '1.1.0-from-main';
export const greet = (who) => `hello, ${who}`;
export const add = (a, b) => a + b;

export const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
