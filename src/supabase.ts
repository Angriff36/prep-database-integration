import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

// Dev debug helper
if (typeof window !== "undefined") {
  (window as any).__SUPABASE_DEBUG__ = {
    hasUrl: Boolean(import.meta.env.VITE_SUPABASE_URL),
    hasKey: Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY),
    url: import.meta.env.VITE_SUPABASE_URL,
    keyPrefix: (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").slice(0, 6),
  };
  console.log("[Supabase env]", (window as any).__SUPABASE_DEBUG__);
}