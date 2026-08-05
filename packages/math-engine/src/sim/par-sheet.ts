/**
 * Generate a machine-readable PAR sheet from internal math config.
 * Usage: tsx src/sim/par-sheet.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MATH_VERSION,
  defaultInternalMath,
  buildPublicConfig,
} from '../config/default-math.js';
import { mathContentHash } from '../math-hash.js';

const math = defaultInternalMath();
const pub = buildPublicConfig(true);
const hash = mathContentHash(math);

const sheet = {
  game: 'Western Stampede',
  mathVersion: MATH_VERSION,
  mathContentHash: hash,
  rtpTarget: pub.rtpTarget,
  maxWinX: math.maxWinX,
  grid: {
    baseHeights: math.baseHeights,
    stampedeHeights: math.stampedeHeights,
    waysBase: math.baseHeights.reduce((a, h) => a * h, 1),
    waysStampede: math.stampedeHeights.reduce((a, h) => a * h, 1),
  },
  paytable: math.paytable,
  freeGamesByScatter: math.freeGamesByScatter,
  retriggerByScatter: math.retriggerByScatter,
  buyOptions: math.buyOptions,
  features: math.features,
  stripLengths: {
    base: math.baseStrips.map((s) => s.length),
    free: math.fgStrips.map((s) => s.length),
  },
  notes: [
    'Pays are multipliers of total bet per way.',
    'Stampede expands heights and guarantees LONGHORN on centre row of each reel.',
    'Empirical RTP requires Monte Carlo (pnpm math:sim / lab:package).',
  ],
};

const outDir = resolve('../../../lab-output');
mkdirSync(outDir, { recursive: true });
const path = resolve(outDir, `PAR_${MATH_VERSION}.json`);
writeFileSync(path, JSON.stringify(sheet, null, 2));
console.log(JSON.stringify({ path, mathVersion: MATH_VERSION, hash }, null, 2));
