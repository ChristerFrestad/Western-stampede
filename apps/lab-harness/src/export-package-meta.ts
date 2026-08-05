/**
 * Emit a small lab package manifest (math hash + RNG pins).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { RNG_ALGORITHM_ID, RNG_BUILD_ID } from '@ws/rng-core';
import {
  MATH_VERSION,
  defaultInternalMath,
  mathContentHash,
} from '@ws/math-engine';

const math = defaultInternalMath();
const manifest = {
  generatedAt: new Date().toISOString(),
  rng: {
    algorithm: RNG_ALGORITHM_ID,
    buildId: RNG_BUILD_ID,
    designDoc: 'docs/compliance/RNG_DESIGN.md',
  },
  math: {
    version: MATH_VERSION,
    contentHash: mathContentHash(math),
    // Documented target in docs/MATH.md — not stored on InternalMathConfig
    rtpTargetNote: 'see docs/MATH.md (~95%)',
  },
  notes: [
    'Attach statistical test reports and 100M+ spin sim before lab submission.',
    'Pin git commit SHA of this export in the formal lab drop.',
  ],
};

const dir = resolve('lab-output');
mkdirSync(dir, { recursive: true });
const path = resolve(dir, 'lab-package-meta.json');
writeFileSync(path, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
console.log(`wrote ${path}`);
