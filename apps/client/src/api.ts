import type {
 BuyTier,
 GameConfigResponse,
 GuestAuthResponse,
 SpinResult,
 TopUpResponse,
 WalletResponse,
} from '@ws/shared';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

let token: string | null = localStorage.getItem('ws_token');

function headers(json = true): HeadersInit {
 const h: Record<string, string> = {};
 if (json) h['Content-Type'] = 'application/json';
 if (token) h.Authorization = `Bearer ${token}`;
 return h;
}

async function parse<T>(res: Response): Promise<T> {
 const data = await res.json().catch(() => ({}));
 if (!res.ok) {
 throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
 }
 return data as T;
}

export function getToken(): string | null {
 return token;
}

export async function guestAuth(): Promise<GuestAuthResponse> {
 const res = await fetch(`${API_BASE}/api/v1/auth/guest`, {
 method: 'POST',
 headers: headers(),
 });
 const data = await parse<GuestAuthResponse>(res);
 token = data.token;
 localStorage.setItem('ws_token', token);
 return data;
}

export async function ensureSession(): Promise<GuestAuthResponse | WalletResponse> {
 if (token) {
 try {
 const w = await getWallet();
 return w;
 } catch {
 localStorage.removeItem('ws_token');
 token = null;
 }
 }
 return guestAuth();
}

export async function getConfig(): Promise<GameConfigResponse> {
 const res = await fetch(`${API_BASE}/api/v1/game/config`);
 return parse(res);
}

export async function getWallet(): Promise<WalletResponse> {
 const res = await fetch(`${API_BASE}/api/v1/wallet`, { headers: headers(false) });
 return parse(res);
}

export async function spin(bet: number, buyTier?: BuyTier): Promise<SpinResult> {
 const clientRoundId =
 typeof crypto !== 'undefined' && crypto.randomUUID
 ? crypto.randomUUID()
 : `r-${Date.now()}-${Math.random().toString(36).slice(2)}`;
 const res = await fetch(`${API_BASE}/api/v1/game/spin`, {
 method: 'POST',
 headers: headers(),
 body: JSON.stringify({ bet, clientRoundId, buyTier }),
 });
 return parse(res);
}

export async function topUp(amount: number): Promise<TopUpResponse> {
 const res = await fetch(`${API_BASE}/api/v1/wallet/topup`, {
 method: 'POST',
 headers: headers(),
 body: JSON.stringify({ amount }),
 });
 return parse(res);
}
