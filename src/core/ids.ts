/** `prefix-N` 形式のIDのうち、既存のものと被らない最小の「最大値+1」を返す（決定的） */
export function nextId(prefix: string, existing: Iterable<string>): string {
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const id of existing) {
    const m = re.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${max + 1}`;
}
