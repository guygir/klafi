const ECC_M = {
  1: { total: 26, ecc: 10, groups: [[1, 16]] },
  2: { total: 44, ecc: 16, groups: [[1, 28]] },
  3: { total: 70, ecc: 26, groups: [[1, 44]] },
  4: { total: 100, ecc: 36, groups: [[2, 32]] },
  5: { total: 134, ecc: 48, groups: [[2, 43]] },
  6: { total: 172, ecc: 64, groups: [[4, 27]] },
  7: { total: 196, ecc: 72, groups: [[4, 31]] },
};

const ALIGN = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
};

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let index = 0, value = 1; index < 255; index += 1) {
  EXP[index] = value;
  LOG[value] = index;
  value <<= 1;
  if (value & 0x100) value ^= 0x11d;
}
for (let index = 255; index < 512; index += 1) EXP[index] = EXP[index - 255];

function gfMul(left, right) {
  return left && right ? EXP[LOG[left] + LOG[right]] : 0;
}

function rsGenerator(degree) {
  let poly = [1];
  for (let index = 0; index < degree; index += 1) {
    const next = new Array(poly.length + 1).fill(0);
    for (let offset = 0; offset < poly.length; offset += 1) {
      next[offset] ^= poly[offset];
      next[offset + 1] ^= gfMul(poly[offset], EXP[index]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, degree) {
  const generator = rsGenerator(degree);
  const ecc = new Array(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ ecc[0];
    ecc.shift();
    ecc.push(0);
    if (!factor) continue;
    for (let index = 0; index < degree; index += 1) {
      ecc[index] ^= gfMul(generator[index + 1], factor);
    }
  }
  return ecc;
}

function chooseVersion(byteLength) {
  for (let version = 1; version <= 7; version += 1) {
    const spec = ECC_M[version];
    const dataBytes = spec.total - spec.ecc;
    const capacity = dataBytes - 2;
    if (byteLength <= capacity) return version;
  }
  throw new Error("QR_TOO_LONG");
}

function reservedMap(size, version) {
  const reserved = Array.from({ length: size }, () => Array(size).fill(false));
  const mark = (row, col) => {
    if (row >= 0 && col >= 0 && row < size && col < size) reserved[row][col] = true;
  };
  const finder = (row, col) => {
    for (let y = -1; y <= 7; y += 1) {
      for (let x = -1; x <= 7; x += 1) mark(row + y, col + x);
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);
  for (let index = 8; index < size - 8; index += 1) {
    mark(6, index);
    mark(index, 6);
  }
  for (const row of ALIGN[version]) {
    for (const col of ALIGN[version]) {
      if ((row < 8 && col < 8) || (row < 8 && col > size - 9) || (row > size - 9 && col < 8)) continue;
      for (let y = -2; y <= 2; y += 1) {
        for (let x = -2; x <= 2; x += 1) mark(row + y, col + x);
      }
    }
  }
  // Format information: 9 cells around the top-left finder, and 8 + 8 beside the other two
  // (the last of those is the dark module). Reserving a 9th cell there stole a data module and
  // shifted every bit after it, so no scanner could read the code.
  for (let index = 0; index < 9; index += 1) {
    mark(8, index);
    mark(index, 8);
  }
  for (let index = 0; index < 8; index += 1) {
    mark(8, size - 1 - index);
    mark(size - 1 - index, 8);
  }
  mark(8, 8);
  if (version >= 7) {
    for (let index = 0; index < 6; index += 1) {
      for (let bit = 0; bit < 3; bit += 1) {
        mark(index, size - 11 + bit);
        mark(size - 11 + bit, index);
      }
    }
  }
  return reserved;
}

function placeFinders(modules, size) {
  const draw = (row, col) => {
    for (let y = 0; y < 7; y += 1) {
      for (let x = 0; x < 7; x += 1) {
        const edge = x === 0 || x === 6 || y === 0 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        modules[row + y][col + x] = edge || core;
      }
    }
  };
  draw(0, 0);
  draw(0, size - 7);
  draw(size - 7, 0);
}

function placeAlignments(modules, version) {
  const size = modules.length;
  for (const row of ALIGN[version]) {
    for (const col of ALIGN[version]) {
      if ((row < 8 && col < 8) || (row < 8 && col > size - 9) || (row > size - 9 && col < 8)) continue;
      for (let y = -2; y <= 2; y += 1) {
        for (let x = -2; x <= 2; x += 1) {
          modules[row + y][col + x] = Math.max(Math.abs(x), Math.abs(y)) !== 1;
        }
      }
    }
  }
}

function placeTimings(modules) {
  const size = modules.length;
  for (let index = 8; index < size - 8; index += 1) {
    modules[6][index] = index % 2 === 0;
    modules[index][6] = index % 2 === 0;
  }
}

function placeVersion(modules, version) {
  if (version < 7) return;
  const size = modules.length;
  let bits = version;
  let rem = bits;
  for (let index = 0; index < 12; index += 1) {
    rem = (rem << 1) ^ ((rem >> 11) * 0x1f25);
  }
  bits = (bits << 12) | rem;
  for (let index = 0; index < 18; index += 1) {
    const dark = Boolean((bits >> index) & 1);
    const row = Math.floor(index / 3);
    const col = size - 11 + (index % 3);
    modules[row][col] = dark;
    modules[col][row] = dark;
  }
}

function maskBit(mask, row, col) {
  switch (mask) {
    case 0: return (row + col) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return col % 3 === 0;
    case 3: return (row + col) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    default: return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
  }
}

function placeFormat(modules, mask) {
  const size = modules.length;
  let bits = (0b00 << 3) | mask;
  let rem = bits;
  for (let index = 0; index < 10; index += 1) {
    rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  }
  bits = ((bits << 10) | rem) ^ 0x5412;
  const positions = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  const mirror = [
    [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8], [size - 5, 8],
    [size - 6, 8], [size - 7, 8], [8, size - 8], [8, size - 7], [8, size - 6],
    [8, size - 5], [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1],
  ];
  for (let index = 0; index < 15; index += 1) {
    const dark = Boolean((bits >> (14 - index)) & 1);
    modules[positions[index][0]][positions[index][1]] = dark;
    modules[mirror[index][0]][mirror[index][1]] = dark;
  }
  modules[size - 8][8] = true;
}

function encodeBytes(bytes, version) {
  const spec = ECC_M[version];
  const dataBytes = spec.total - spec.ecc;
  const bits = [];
  const push = (value, length) => {
    for (let index = length - 1; index >= 0; index -= 1) bits.push((value >> index) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, 8);
  for (const byte of bytes) push(byte, 8);
  push(0, Math.min(4, dataBytes * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let index = 0; index < bits.length; index += 8) {
    data.push(bits.slice(index, index + 8).reduce((sum, bit) => (sum << 1) | bit, 0));
  }
  const pads = [0xec, 0x11];
  let pad = 0;
  while (data.length < dataBytes) {
    data.push(pads[pad & 1]);
    pad += 1;
  }
  const blocks = [];
  let offset = 0;
  const eccPerBlock = spec.ecc / spec.groups.reduce((sum, [count]) => sum + count, 0);
  for (const [count, blockData] of spec.groups) {
    for (let index = 0; index < count; index += 1) {
      const chunk = data.slice(offset, offset + blockData);
      offset += blockData;
      blocks.push({ data: chunk, ecc: rsEncode(chunk, eccPerBlock) });
    }
  }
  const interleaved = [];
  const maxData = Math.max(...blocks.map((block) => block.data.length));
  for (let index = 0; index < maxData; index += 1) {
    for (const block of blocks) {
      if (index < block.data.length) interleaved.push(block.data[index]);
    }
  }
  const maxEcc = Math.max(...blocks.map((block) => block.ecc.length));
  for (let index = 0; index < maxEcc; index += 1) {
    for (const block of blocks) interleaved.push(block.ecc[index]);
  }
  return interleaved;
}

function fillData(modules, reserved, bytes) {
  const size = modules.length;
  const bits = [];
  for (const byte of bytes) {
    for (let index = 7; index >= 0; index -= 1) bits.push((byte >> index) & 1);
  }
  let bit = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (const offset of [0, -1]) {
        const x = col + offset;
        if (reserved[row][x] || bit >= bits.length) continue;
        modules[row][x] = Boolean(bits[bit]);
        bit += 1;
      }
    }
    upward = !upward;
  }
}

function applyMask(modules, reserved, mask) {
  const size = modules.length;
  const next = modules.map((row) => row.slice());
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!reserved[row][col] && maskBit(mask, row, col)) next[row][col] = !next[row][col];
    }
  }
  return next;
}

function penalty(modules) {
  const size = modules.length;
  let score = 0;
  const lines = (horizontal) => {
    for (let a = 0; a < size; a += 1) {
      let run = 1;
      for (let b = 1; b < size; b += 1) {
        const same = horizontal ? modules[a][b] === modules[a][b - 1] : modules[b][a] === modules[b - 1][a];
        if (same) {
          run += 1;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else run = 1;
      }
    }
  };
  lines(true);
  lines(false);
  for (let row = 0; row < size - 1; row += 1) {
    for (let col = 0; col < size - 1; col += 1) {
      const dark = modules[row][col];
      if (modules[row][col + 1] === dark && modules[row + 1][col] === dark && modules[row + 1][col + 1] === dark) {
        score += 3;
      }
    }
  }
  const finder = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const scan = (values) => {
    const bits = values.map((value) => (value ? 1 : 0));
    for (let index = 0; index <= bits.length - 11; index += 1) {
      if (finder.every((bit, offset) => bit === bits[index + offset])
        || finder.slice().reverse().every((bit, offset) => bit === bits[index + offset])) {
        score += 40;
      }
    }
  };
  for (let index = 0; index < size; index += 1) {
    scan(modules[index]);
    scan(modules.map((row) => row[index]));
  }
  let dark = 0;
  for (const row of modules) dark += row.filter(Boolean).length;
  score += Math.abs(Math.floor((dark * 100) / (size * size) / 5) - 10) * 10;
  return score;
}

export function qrModules(text) {
  const bytes = [...Buffer.from(String(text), "utf8")];
  const version = chooseVersion(bytes.length);
  const size = version * 4 + 17;
  const reserved = reservedMap(size, version);
  const base = Array.from({ length: size }, () => Array(size).fill(false));
  placeFinders(base, size);
  placeAlignments(base, version);
  placeTimings(base);
  placeVersion(base, version);
  fillData(base, reserved, encodeBytes(bytes, version));
  let best = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const masked = applyMask(base, reserved, mask);
    placeFormat(masked, mask);
    const score = penalty(masked);
    if (score < bestScore) {
      best = masked;
      bestScore = score;
    }
  }
  return best;
}

export function qrSvg(text, { size = 168 } = {}) {
  const modules = qrModules(text);
  const count = modules.length;
  const quiet = 4;
  const view = count + quiet * 2;
  const rects = [];
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (modules[row][col]) rects.push(`<rect x="${col + quiet}" y="${row + quiet}" width="1" height="1"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view} ${view}" width="${size}" height="${size}" role="img" aria-label="קוד QR"><rect width="${view}" height="${view}" fill="#f7f2e8"/>${rects.join("")}</svg>`;
}
