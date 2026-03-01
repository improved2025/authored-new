// public/auth-guard.js
(() => {
  const isPublicRoute = () => {
    const p = window.location.pathname || "";
    return (
      p === "/" ||
      p.startsWith("/login") ||
      p.startsWith("/signup") ||
      p.startsWith("/verify") ||
      p.startsWith("/_next") ||
      p.startsWith("/api")
    );
  };

  // Don't run guard on public routes (especially /login)
  if (isPublicRoute()) return;

  const nextPath = () => {
    const p = window.location.pathname || "/";
    const s = window.location.search || "";
    return p + s;
  };

  const goLogin = () => {
    window.location.replace("/login?next=" + encodeURIComponent(nextPath()));
  };

  const goVerify = () => {
    window.location.replace("/verify?next=" + encodeURIComponent(nextPath()));
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Run async without top-level await
  (async () => {
    try {
      // Wait briefly for account.js to initialize (avoid reload loops)
      for (let i = 0; i < 40; i++) {
        const client = window.AuthoredAccount?.client;
        if (client?.auth?.getSession) break;
        await sleep(50);
      }

      const account = window.AuthoredAccount;
      const client = account?.client;

      if (!client?.auth?.getSession) {
        // If still not ready, fail closed to login
        goLogin();
        return;
      }

      const { data } = await client.auth.getSession();
      const session = data?.session;

      if (!session) {
        goLogin();
        return;
      }

      const user = session.user;
      const provider = user?.app_metadata?.provider;

      const isAnon =
        user?.is_anonymous === true ||
        provider === "anonymous" ||
        !user?.email;

      if (isAnon) {
        goLogin();
        return;
      }

      if (!user?.email_confirmed_at) {
        goVerify();
        return;
      }
    } catch {
      goLogin();
    }
  })();
})();