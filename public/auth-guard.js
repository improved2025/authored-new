// public/auth-guard.js
(async function () {
  // Never guard the login page (otherwise blank/redirect loop)
  if (location.pathname.startsWith("/login")) return;

  const client = window.AuthoredAccount?.client;

  // Wait until account.js has created the client
  if (!client?.auth?.getSession) {
    setTimeout(() => location.reload(), 50);
    return;
  }

  const { data } = await client.auth.getSession();
  const session = data?.session;

  if (!session) {
    window.location.replace("/login");
    return;
  }

  // Treat anonymous as NOT authenticated
  const provider = session.user?.app_metadata?.provider;
  const isAnon =
    session.user?.is_anonymous === true ||
    provider === "anonymous" ||
    !session.user?.email;

  if (isAnon) {
    window.location.replace("/login");
    return;
  }
})();