import { api } from './api';

const IRACING_AUTHORIZE_URL = 'https://oauth.iracing.com/oauth2/authorize';
const CLIENT_ID = import.meta.env.VITE_IRACING_CLIENT_ID as string;
const REDIRECT_URI = import.meta.env.VITE_IRACING_REDIRECT_URI as string;

const STATE_KEY = 'iracing_oauth_state';
const VERIFIER_KEY = 'iracing_pkce_verifier';
const PURPOSE_KEY = 'iracing_oauth_purpose';

export type IracingOAuthPurpose = 'link-profile' | 'sync-cars' | 'sync-tracks' | 'sync-series' | 'sync-team';

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateRandomString(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return base64UrlEncode(bytes);
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return base64UrlEncode(new Uint8Array(digest));
}

async function beginIracingOAuth(purpose: IracingOAuthPurpose, scope: string): Promise<void> {
  const verifier = generateRandomString(32);
  const state = generateRandomString(16);
  const challenge = await sha256Base64Url(verifier);

  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(PURPOSE_KEY, purpose);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    scope,
  });

  window.location.href = `${IRACING_AUTHORIZE_URL}?${params.toString()}`;
}

/** Redirects to iRacing's OAuth authorize endpoint requesting both "iracing.profile" (name/
 * cust_id) and "iracing.auth" (Data API access, used once server-side for a location/iRating/
 * safety-rating snapshot). No refresh token is kept. */
export function beginIracingLink(): Promise<void> {
  return beginIracingOAuth('link-profile', 'iracing.profile iracing.auth');
}

/** Redirects to iRacing's OAuth authorize endpoint requesting only "iracing.auth" — used to
 * refresh the cached car catalog (see CarFormPage), not tied to any specific member. */
export function beginIracingCarSync(): Promise<void> {
  return beginIracingOAuth('sync-cars', 'iracing.auth');
}

/** Same as beginIracingCarSync() but for the track catalog (see EventFormPage). */
export function beginIracingTrackSync(): Promise<void> {
  return beginIracingOAuth('sync-tracks', 'iracing.auth');
}

/** Same as beginIracingCarSync() but for the official series/season/weather catalog (see
 * SeriesListPage). */
export function beginIracingSeriesSync(): Promise<void> {
  return beginIracingOAuth('sync-series', 'iracing.auth');
}

/** Same as beginIracingCarSync() but imports every iRacing Team the completing account belongs
 * to (see IracingTeamsPage) — whoever runs this needs to actually be a member of whichever
 * team(s) should get imported, since the backend finds them via that account's own
 * /team/membership, not an arbitrary team id. */
export function beginIracingTeamSync(): Promise<void> {
  return beginIracingOAuth('sync-team', 'iracing.auth');
}

/** Reads (without consuming) which flow a pending OAuth redirect belongs to — the callback
 * page needs this to decide which "complete" function to call. */
export function peekIracingOAuthPurpose(): IracingOAuthPurpose | null {
  return sessionStorage.getItem(PURPOSE_KEY) as IracingOAuthPurpose | null;
}

function consumePkceState(state: string): string {
  const expectedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(PURPOSE_KEY);

  if (!expectedState || !verifier || state !== expectedState) {
    throw new Error('iRacing sign-in state did not match — please try again.');
  }
  return verifier;
}

/** Hands the code + PKCE verifier to our own backend, which does the actual token exchange
 * server-to-server — iRacing's endpoints don't send CORS headers permitting a direct browser
 * call, even for this public/PKCE client type. */
export async function completeIracingLink(code: string, state: string): Promise<void> {
  const verifier = consumePkceState(state);
  await api.post('/iracing/link', { code, codeVerifier: verifier });
}

export async function completeIracingCarSync(code: string, state: string): Promise<{ synced: number }> {
  const verifier = consumePkceState(state);
  return api.post('/iracing/cars/sync', { code, codeVerifier: verifier });
}

export async function completeIracingTrackSync(code: string, state: string): Promise<{ synced: number }> {
  const verifier = consumePkceState(state);
  return api.post('/iracing/tracks/sync', { code, codeVerifier: verifier });
}

export async function completeIracingSeriesSync(code: string, state: string): Promise<{ synced: number }> {
  const verifier = consumePkceState(state);
  return api.post('/iracing/series/sync', { code, codeVerifier: verifier });
}

export async function completeIracingTeamSync(code: string, state: string): Promise<{ teamsSynced: number }> {
  const verifier = consumePkceState(state);
  return api.post('/iracing/teams/sync', { code, codeVerifier: verifier });
}
