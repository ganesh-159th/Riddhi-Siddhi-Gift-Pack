// Pure line-diff helpers for the admin panel's version history view (issue #20).
// Keep DOM-free so the exact same algorithm is unit-tested in tests/diff.test.js.

// Classic longest-common-subsequence diff between two texts split into lines.
// Returns [{ type: "same" | "del" | "add", line }] so callers can render an
// unambiguous before→after view: `del` lines belong to the old text, `add`
// lines to the new one.
export function diffLines(aText, bText) {
  const split = (t) => {
    const s = String(t ?? "");
    return s === "" ? [] : s.split("\n");
  };
  const a = split(aText);
  const b = split(bText);
  const n = a.length;
  const m = b.length;

  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "same", line: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", line: a[i] });
      i++;
    } else {
      out.push({ type: "add", line: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ type: "del", line: a[i++] });
  while (j < m) out.push({ type: "add", line: b[j++] });
  return out;
}

// Compress long runs of unchanged lines into a { type: "gap", count } marker so
// the diff stays scannable while still showing `context` lines around each
// change. Counts unchanged lines; add/del lines always pass through.
export function squashDiff(lines, context = 3) {
  const out = [];
  let buffer = [];
  const flush = () => {
    if (buffer.length > context * 2 + 1) {
      for (let k = 0; k < context; k++) out.push(buffer[k]);
      out.push({ type: "gap", count: buffer.length - context * 2 });
      for (let k = 0; k < context; k++) out.push(buffer[buffer.length - context + k]);
    } else {
      out.push(...buffer);
    }
    buffer = [];
  };
  for (const l of lines) {
    if (l.type === "same") {
      buffer.push(l);
    } else {
      flush();
      out.push(l);
    }
  }
  flush();
  return out;
}