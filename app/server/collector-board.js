export const COLLECTOR_BOARD_SIZE = 10;

export function takeCollectorBoard(allCollectors, size = COLLECTOR_BOARD_SIZE) {
  const ranked = Array.isArray(allCollectors) ? allCollectors : [];
  const board = ranked.slice(0, size);
  const current = ranked.find((entry) => entry.current);
  if (current && !board.some((entry) => entry.current)) {
    if (board.length < size) board.push(current);
    else board[size - 1] = current;
  }
  return {
    collectors: board,
    collectorCount: ranked.length,
    yourCollectorRank: current?.rank ?? null,
  };
}

/** Total opened numbered copies in a { cardId: copies } bag. */
export function numberedTotal(bag = {}) {
  return Object.values(bag || {}).reduce((sum, copies) => sum + Math.max(0, Math.round(Number(copies) || 0)), 0);
}

/**
 * Numbered board: players holding at least one opened numbered copy, most copies first, then stars.
 * Same top-N plus "your rank" shape as the collector board. Entries carry display names only.
 */
export function takeNumberedBoard(allCollectors, size = COLLECTOR_BOARD_SIZE) {
  const ranked = (Array.isArray(allCollectors) ? allCollectors : [])
    .filter((entry) => Number(entry?.numbered) > 0)
    .map((entry) => ({ ...entry }))
    .sort((a, b) => b.numbered - a.numbered || b.stars - a.stars || b.ownedUnique - a.ownedUnique)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
  const { collectors, collectorCount, yourCollectorRank } = takeCollectorBoard(ranked, size);
  return {
    numberedCollectors: collectors,
    numberedCollectorCount: collectorCount,
    yourNumberedRank: yourCollectorRank,
  };
}
