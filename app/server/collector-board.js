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
