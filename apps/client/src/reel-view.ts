import { Application, Container, Graphics, Text } from 'pixi.js';
import type { SymbolId } from '@ws/shared';
import { styleFor } from './symbols';

const CELL_W = 96;
const CELL_H = 72;
const GAP = 6;
const REEL_GAP = 10;

export class ReelView {
 app: Application;
 root = new Container();
 private reels: Container[] = [];
 private cells: Graphics[][] = [];
 private labels: Text[][] = [];
 private heights = [4, 6, 6, 6, 4];
 private spinning = false;
 private boardBg: Graphics;

 constructor(canvas: HTMLCanvasElement) {
 this.app = new Application();
 this.boardBg = new Graphics();
 void this.init(canvas);
 }

 private async init(canvas: HTMLCanvasElement) {
 await this.app.init({
 canvas,
 background: '#120c08',
 antialias: true,
 resolution: Math.min(window.devicePixelRatio || 1, 2),
 autoDensity: true,
 resizeTo: canvas.parentElement ?? undefined,
 });
 this.app.stage.addChild(this.root);
 this.drawDesertBackdrop();
 this.root.addChild(this.boardBg);
 this.layoutBoard(this.heights, emptyGrid(this.heights));
 this.centerBoard();
 window.addEventListener('resize', () => this.centerBoard());
 }

 private drawDesertBackdrop() {
 const g = new Graphics();
 g.rect(-2000, -2000, 4000, 4000);
 g.fill(0x1a120c);
 // Mesa silhouettes
 g.moveTo(-400, 200);
 g.lineTo(-200, 40);
 g.lineTo(0, 120);
 g.lineTo(200, 20);
 g.lineTo(450, 180);
 g.lineTo(450, 400);
 g.lineTo(-400, 400);
 g.closePath();
 g.fill({ color: 0x2a1a10, alpha: 0.9 });
 // Sun
 g.circle(280, -80, 48);
 g.fill({ color: 0xe8b84a, alpha: 0.35 });
 this.root.addChildAt(g, 0);
 }

 private centerBoard() {
 const w = this.app.screen.width;
 const h = this.app.screen.height;
 const boardW = 5 * CELL_W + 4 * REEL_GAP;
 const boardH = 10 * (CELL_H + GAP);
 this.root.x = w / 2;
 this.root.y = h / 2;
 // board local origin at center
 this.boardBg.x = -boardW / 2 - 16;
 this.boardBg.y = -boardH / 2 - 16;
 for (const reel of this.reels) {
 // reels already positioned relative to board center
 }
 void boardW;
 }

 layoutBoard(heights: number[], grid: SymbolId[][]) {
 this.heights = heights;
 // Clear reels
 for (const r of this.reels) r.destroy({ children: true });
 this.reels = [];
 this.cells = [];
 this.labels = [];

 const boardW = 5 * CELL_W + 4 * REEL_GAP;
 const maxRows = Math.max(...heights);
 const boardH = maxRows * (CELL_H + GAP);

 this.boardBg.clear();
 this.boardBg.roundRect(0, 0, boardW + 32, boardH + 32, 16);
 this.boardBg.fill({ color: 0x1a1410, alpha: 0.92 });
 this.boardBg.stroke({ color: 0xe8b84a, width: 2, alpha: 0.45 });

 const originX = -boardW / 2;
 const originY = -boardH / 2;

 for (let r = 0; r < 5; r++) {
 const reel = new Container();
 reel.x = originX + r * (CELL_W + REEL_GAP);
 const h = heights[r]!;
 const yOff = ((maxRows - h) * (CELL_H + GAP)) / 2;
 reel.y = originY + yOff;

 const reelCells: Graphics[] = [];
 const reelLabels: Text[] = [];
 for (let row = 0; row < h; row++) {
 const cell = new Graphics();
 const label = new Text({
 text: '',
 style: {
 fontFamily: 'Bebas Neue, Arial',
 fontSize: 28,
 fill: 0xffffff,
 align: 'center',
 },
 });
 label.anchor.set(0.5);
 label.x = CELL_W / 2;
 label.y = row * (CELL_H + GAP) + CELL_H / 2;
 cell.y = row * (CELL_H + GAP);
 reel.addChild(cell);
 reel.addChild(label);
 reelCells.push(cell);
 reelLabels.push(label);
 this.paintCell(cell, label, grid[r]?.[row] ?? '9');
 }
 this.root.addChild(reel);
 this.reels.push(reel);
 this.cells.push(reelCells);
 this.labels.push(reelLabels);
 }
 this.centerBoard();
 }

 private paintCell(cell: Graphics, label: Text, sym: SymbolId | string) {
 const st = styleFor(sym);
 cell.clear();
 cell.roundRect(0, 0, CELL_W, CELL_H, 10);
 cell.fill(Number(st.bg.replace('#', '0x')));
 if (st.ring) {
 cell.stroke({ color: Number(st.ring.replace('#', '0x')), width: 2, alpha: 0.9 });
 } else {
 cell.stroke({ color: 0x000000, width: 1, alpha: 0.35 });
 }
 label.text = st.label;
 label.style.fill = Number(st.fg.replace('#', '0x'));
 }

 setGrid(grid: SymbolId[][], heights?: number[]) {
 if (heights && heights.join() !== this.heights.join()) {
 this.layoutBoard(heights, grid);
 return;
 }
 for (let r = 0; r < grid.length; r++) {
 for (let row = 0; row < grid[r]!.length; row++) {
 const cell = this.cells[r]?.[row];
 const label = this.labels[r]?.[row];
 if (cell && label) this.paintCell(cell, label, grid[r]![row]!);
 }
 }
 }

 async animateSpin(grid: SymbolId[][], heights: number[]): Promise<void> {
 if (this.spinning) return;
 this.spinning = true;

 // Resize if stampede
 if (heights.join() !== this.heights.join()) {
 this.layoutBoard(heights, grid.map((reel) => reel.map(() => '9' as SymbolId)));
 }

 const spinMs = 900;
 const start = performance.now();
 const tickers: Array<() => void> = [];

 for (let r = 0; r < 5; r++) {
 const delay = r * 120;
 const scramble = () => {
 for (let row = 0; row < this.heights[r]!; row++) {
 const cell = this.cells[r]![row]!;
 const label = this.labels[r]![row]!;
 const keys = Object.keys(
 // lightweight scramble pool
 { '9': 1, J: 1, Q: 1, LONGHORN: 1, WILD: 1, SCATTER: 1, EAGLE: 1 },
 );
 const sym = keys[Math.floor(Math.random() * keys.length)]!;
 this.paintCell(cell, label, sym);
 }
 };
 const iv = window.setInterval(scramble, 50);
 tickers.push(() => clearInterval(iv));
 window.setTimeout(() => {
 clearInterval(iv);
 // reveal final for this reel
 for (let row = 0; row < grid[r]!.length; row++) {
 const cell = this.cells[r]![row]!;
 const label = this.labels[r]![row]!;
 this.paintCell(cell, label, grid[r]![row]!);
 }
 // bounce
 const reel = this.reels[r]!;
 const baseY = reel.y;
 reel.y = baseY + 8;
 window.setTimeout(() => {
 reel.y = baseY;
 }, 80);
 }, spinMs + delay);
 }

 await sleep(spinMs + 5 * 120 + 100);
 tickers.forEach((t) => t());
 this.setGrid(grid, heights);
 this.spinning = false;
 void start;
 }

 highlightWins(wins: Array<{ symbol: string }>) {
 if (!wins.length) return;
 const symbols = new Set(wins.map((w) => w.symbol));
 for (let r = 0; r < this.cells.length; r++) {
 for (let row = 0; row < this.cells[r]!.length; row++) {
 const label = this.labels[r]![row]!;
 // crude: pulse if label matches known style label for winning symbols
 // We re-read from last painted — instead pulse all cells of winning symbols via re-paint glow
 void symbols;
 void label;
 }
 }
 // Flash board border
 this.boardBg.stroke({ color: 0xffe080, width: 3, alpha: 1 });
 window.setTimeout(() => {
 this.boardBg.stroke({ color: 0xe8b84a, width: 2, alpha: 0.45 });
 }, 400);
 }
}

function emptyGrid(heights: number[]): SymbolId[][] {
 return heights.map((h) => Array.from({ length: h }, () => 'LONGHORN' as SymbolId));
}

function sleep(ms: number) {
 return new Promise((r) => setTimeout(r, ms));
}
