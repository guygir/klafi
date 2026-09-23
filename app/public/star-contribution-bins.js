export function starTickLabel(start, end = start) {
  const from = Math.max(0, Math.round(Number(start) || 0));
  const to = Math.max(from, Math.round(Number(end) || 0));
  if (from === to) return `${from}★`;
  return `${from}★ – ${to}★`;
}

export function starContributionBins(scores = []) {
  const values = scores.map((row) => Math.max(0, Math.round(Number(row.stars) || 0)));
  const current = scores.find((row) => row.current);
  const you = current == null ? null : Math.max(0, Math.round(Number(current.stars) || 0));
  if (!values.length) return [];
  const min = 0;
  const max = Math.max(...values, you ?? 0);
  const span = max - min;
  const step = span > 10 ? Math.ceil(span / 10) : 1;
  const bins = [];
  for (let start = min; start <= max; start += step) {
    const end = Math.min(max, start + step - 1);
    bins.push({
      label: starTickLabel(start, end),
      start,
      end,
      count: values.filter((value) => value >= start && value <= end).length,
      you: you != null && you >= start && you <= end,
    });
  }
  return bins;
}
