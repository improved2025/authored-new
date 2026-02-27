// public/auth-guard.js
(async () => {
  // Don’t run guard on the login page (prevents blank/loop)
  if (location.pathname.startsWith("/login")) return;

  const client = window.AuthoredAccount?.client;

  // account.js might not be ready yet
  if (!client?.auth?.getSession) {
    setTimeout(() => location.reload(), 50);
    return;
  }

  const {
    data: { session },
  } = await client.auth.getSession();

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