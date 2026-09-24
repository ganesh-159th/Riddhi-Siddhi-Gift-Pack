import { describe, expect, test } from "vitest";
import { diffLines, squashDiff } from "../src/admin/diff.js";

describe("diffLines", () => {
  test("identical text -> all same lines", () => {
    const lines = diffLines("a\nb\nc", "a\nb\nc");
    expect(lines).toEqual([
      { type: "same", line: "a" },
      { type: "same", line: "b" },
      { type: "same", line: "c" },
    ]);
  });

  test("insertions and deletions are distinguished", () => {
    const lines = diffLines("a\nb\nc", "a\nb\nX\nc");
    expect(lines.some((l) => l.type === "add" && l.line === "X")).toBe(true);
    expect(lines.filter((l) => l.type === "add").length).toBe(1);
    expect(lines.filter((l) => l.type === "del").length).toBe(0);
  });

  test("replacement shows a del then an add", () => {
    const lines = diffLines("price: 100", "price: 120");
    expect(lines).toEqual([
      { type: "del", line: "price: 100" },
      { type: "add", line: "price: 120" },
    ]);
  });

  test("empty sides", () => {
    expect(diffLines("", "")).toEqual([]);
    expect(diffLines("x", "").every((l) => l.type === "del")).toBe(true);
    expect(diffLines("", "x").every((l) => l.type === "add")).toBe(true);
  });

  test("handles non-string inputs", () => {
    expect(() => diffLines(undefined, null)).not.toThrow();
    expect(diffLines(undefined, null)).toEqual([]);
  });
});

describe("squashDiff", () => {
  const sameRun = (n) =>
    Array.from({ length: n }, (_, i) => ({ type: "same", line: `line${i}` }));

  test("keeps short unchanged runs verbatim", () => {
    const lines = [
      ...sameRun(3),
      { type: "del", line: "old" },
      { type: "add", line: "new" },
    ];
    expect(squashDiff(lines, 3)).toEqual(lines);
  });

  test("collapses long unchanged runs into a gap marker", () => {
    const lines = [
      ...sameRun(12),
      { type: "del", line: "old" },
      { type: "add", line: "new" },
    ];
    const out = squashDiff(lines, 3);
    const gap = out.find((l) => l.type === "gap");
    expect(gap).toBeTruthy();
    expect(gap.count).toBe(12 - 6); // 12 unchanged − 3 leading − 3 trailing context
    expect(out.filter((l) => l.type === "same").length).toBe(6);
    expect(out.at(-1)).toEqual({ type: "add", line: "new" });
  });

  test("empty / no-op input", () => {
    expect(squashDiff([])).toEqual([]);
  });
});