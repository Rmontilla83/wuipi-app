import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export function createServerSupabase() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Server component — ignore
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // Server component — ignore
          }
        },
      },
    }
  );
}

// Admin client with service role — uses createClient (not createServerClient)
// to properly bypass RLS. createServerClient from @supabase/ssr doesn't
// fully bypass RLS even with the service role key.
//
// CRITICAL: pasamos un fetch custom con cache:'no-store'. Sin esto, Next.js
// 14 cachea por default los fetches internos del SDK Supabase incluso en
// Route Handlers con `dynamic = "force-dynamic"`, devolviendo lecturas
// stale (ej. status="pending" cuando la DB ya dice "paid"). Bug observado
// 2026-05-02 con polling de /api/cobranzas/[token]: el endpoint devolvia
// siempre el primer snapshot leido, ignorando cambios posteriores en DB.
export function createAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: (url, init) =>
          fetch(url, { ...init, cache: "no-store" }),
      },
    }
  );
}
