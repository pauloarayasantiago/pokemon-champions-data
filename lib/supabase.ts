import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function loadRootEnv(): void {
  if (process.env.__PC_ENV_LOADED__) return;
  process.env.__PC_ENV_LOADED__ = "1";

  const projectRoot = process.env.POKEMON_DATA_ROOT
    ? resolve(process.env.POKEMON_DATA_ROOT)
    : (() => {
        try {
          return resolve(dirname(fileURLToPath(import.meta.url)), "..");
        } catch {
          return process.cwd();
        }
      })();

  const envPath = resolve(projectRoot, ".env");
  if (!existsSync(envPath)) return;
  try {
    const content = readFileSync(envPath, "utf-8");
    for (const raw of content.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // malformed .env — silently skip
  }
}

loadRootEnv();

function getUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  if (!url) throw new Error("Supabase URL missing: set NEXT_PUBLIC_SUPABASE_URL or VITE_SUPABASE_URL");
  return url;
}

let _server: SupabaseClient | null = null;
export function supabaseServer(): SupabaseClient {
  if (_server) return _server;
  const key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SECRET ??
    process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error("Supabase secret key missing: set SUPABASE_SECRET_KEY (or SUPABASE_SECRET)");
  _server = createClient(getUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _server;
}

let _anon: SupabaseClient | null = null;
export function supabaseAnon(): SupabaseClient {
  if (_anon) return _anon;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("Supabase publishable key missing: set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY)");
  _anon = createClient(getUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _anon;
}
