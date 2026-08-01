import { SeededPrng } from '../rng.js';
import { SpinEngine } from '../spin-engine.js';
import type { FreeGameSession } from '../spin-engine.js';

async function main() {
 const spins = Number(process.argv[2] ?? 100_000);
 const bet = 100;
 const rng = new SeededPrng(42);
 const engine = new SpinEngine(undefined, rng);

 let wagered = 0;
 let won = 0;
 let hits = 0;
 let freeTriggers = 0;
 let stampedes = 0;
 let freeSession: FreeGameSession | null = null;

 for (let i = 0; i < spins; i++) {
 const out = await engine.spin({
 bet,
 mode: freeSession ? 'FREE' : 'BASE',
 freeSession,
 });
 wagered += out.debitAmount;
 won += out.result.totalWin;
 if (out.result.totalWin > 0) hits++;
 if (out.result.features.enteredFreeGames) freeTriggers++;
 if (out.result.features.stampede) stampedes++;
 freeSession = out.nextFreeSession;
 }

 const rtp = wagered > 0 ? won / wagered : 0;
 console.log(
 JSON.stringify(
 {
 spins,
 bet,
 wagered,
 won,
 rtp: Number(rtp.toFixed(6)),
 hitRate: Number((hits / spins).toFixed(4)),
 freeTriggers,
 freeTriggerRate: Number((freeTriggers / spins).toFixed(6)),
 stampedes,
 stampedeRate: Number((stampedes / spins).toFixed(6)),
 },
 null,
 2,
 ),
 );
}

main().catch((e) => {
 console.error(e);
 process.exit(1);
});
