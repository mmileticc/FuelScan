import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let authReady = false;
let currentUser = null;
const authListeners = [];

export function getCurrentUser() {
  return currentUser;
}

export function isAuthReady() {
  return authReady;
}

export function onAuthReady(cb) {
  authListeners.push(cb);
  if (authReady) cb(currentUser);
}

function emitAuthReady() {
  for (const cb of authListeners) cb(currentUser);
}

export async function initAuth() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    authReady = true;
    currentUser = null;
    emitAuthReady();
    return null;
  }

  currentUser = data.session?.user ?? null;
  authReady = true;
  emitAuthReady();
  return currentUser;
}

supabase.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user ?? null;
  authReady = true;
  queueMicrotask(() => emitAuthReady());
});

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
    },
  });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.access_token || null;
}