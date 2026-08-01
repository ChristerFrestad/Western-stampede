import { Assets, Texture } from 'pixi.js';
import type { SymbolId } from '@ws/shared';

export const SYMBOL_FILES: Record<string, string> = {
  '9': '/assets/symbols/9.jpg',
  '10': '/assets/symbols/10.jpg',
  J: '/assets/symbols/J.jpg',
  Q: '/assets/symbols/Q.jpg',
  K: '/assets/symbols/K.jpg',
  A: '/assets/symbols/A.jpg',
  EAGLE: '/assets/symbols/EAGLE.jpg',
  COYOTE: '/assets/symbols/COYOTE.jpg',
  WOLF: '/assets/symbols/WOLF.jpg',
  STAG: '/assets/symbols/STAG.jpg',
  LONGHORN: '/assets/symbols/LONGHORN.jpg',
  WILD: '/assets/symbols/WILD.jpg',
  WILD_FG: '/assets/symbols/WILD_FG.jpg',
  SCATTER: '/assets/symbols/SCATTER.jpg',
  SUPERCOIN: '/assets/symbols/SUPERCOIN.jpg',
};

export const UI_FILES = {
  bg: '/assets/ui/bg-desert.jpg',
  frame: '/assets/ui/cabinet-frame.jpg',
  wheel: '/assets/ui/supercoin-wheel.jpg',
  freeSplash: '/assets/ui/free-games-splash.jpg',
};

const ALL_SYMBOL_IDS = Object.keys(SYMBOL_FILES);

let loaded = false;
const textures = new Map<string, Texture>();
let bgTexture: Texture | null = null;
let frameTexture: Texture | null = null;

export async function loadGameAssets(): Promise<void> {
  if (loaded) return;
  const bundle: Record<string, string> = { ...SYMBOL_FILES, ...UI_FILES };
  await Assets.load(Object.values(bundle));
  for (const [id, path] of Object.entries(SYMBOL_FILES)) {
    textures.set(id, Assets.get(path));
  }
  bgTexture = Assets.get(UI_FILES.bg);
  frameTexture = Assets.get(UI_FILES.frame);
  loaded = true;
}

export function tex(id: SymbolId | string): Texture {
  return textures.get(id) ?? textures.get('A')!;
}

export function bgTex(): Texture {
  return bgTexture!;
}

export function frameTex(): Texture {
  return frameTexture!;
}

export function randomSymbolId(): SymbolId {
  return ALL_SYMBOL_IDS[Math.floor(Math.random() * ALL_SYMBOL_IDS.length)] as SymbolId;
}

export function allSymbolIds(): string[] {
  return ALL_SYMBOL_IDS;
}
