/** Column-wise quantiles over equal-length rows (NaN-safe). */
export function columnQuantiles(rows: readonly (readonly number[])[], qs: readonly number[]): number[][] {
  if (!rows.length) return qs.map(() => []);
  const width = Math.min(...rows.map((r) => r.length));
  const out = qs.map(() => new Array<number>(width).fill(Number.NaN));
  for (let c = 0; c < width; c++) {
    const column = rows
      .map((r) => r[c])
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b);
    if (!column.length) continue;
    qs.forEach((q, qi) => {
      const pos = (column.length - 1) * q;
      const lo = Math.floor(pos);
      const hi = Math.ceil(pos);
      out[qi][c] = column[lo] + (column[hi] - column[lo]) * (pos - lo);
    });
  }
  return out;
}
