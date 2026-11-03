// Authorization hook.
//
// The current Labmitra project has NO authentication system (checked: Next.js app
// with /api/analyze, /api/tts, /api/geo only). This hook is the single place to plug
// one in later (NextAuth/Auth.js, Clerk, Supabase Auth, a session cookie, etc.).
//
// Until then it applies a cheap same-origin check (blocks other websites from calling
// the API from a browser). This is NOT authentication: scripts/curl can still call it,
// so protect the endpoint with Vercel Firewall rate limits as well.

export async function authorizeRequest(req) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return { ok: false, status: 403, error: "forbidden_origin" };
    } catch {
      return { ok: false, status: 403, error: "forbidden_origin" };
    }
  }

  // TODO(auth): e.g.
  //   const session = await getServerSession(authOptions);
  //   if (!session) return { ok: false, status: 401, error: "unauthorized" };
  //   return { ok: true, userId: session.user.id };
  return { ok: true, userId: null };
}
