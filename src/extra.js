// Lives apart from app.js ON PURPOSE: when main and a branch both append to
// the same file, git reports a conflict and the fixture stops describing the
// state it claims to describe.
export const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
