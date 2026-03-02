// account.js
// Shared auth + session helpers for all pages.
// Requires: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

function readSupabaseConfig() {
  const cfg = window.__APP_CONFIG__ || window.__AUTHORED_CONFIG__ || {};
  const url = (cfg.supabaseUrl || cfg.SUPABASE_URL || "").toString().trim();
  const anonKey = (cfg.supabaseAnonKey || cfg.SUPABASE_ANON_KEY || "")
    .toString()
    .trim();

  return { url, anonKey };
}

(function initAuthoredAccount() {
  try {
    const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = readSupabaseConfig();

    if (!SUPABASE_URL || SUPABASE_URL.includes("PASTE_")) {
      throw new Error(
        "Missing SUPABASE_URL for account.js. Inject window.__APP_CONFIG__ = { supabaseUrl, supabaseAnonKey } before loading account.js"
      );
    }
    if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes("PASTE_")) {
      throw new Error(
        "Missing SUPABASE_ANON_KEY for account.js. Inject window.__APP_CONFIG__ = { supabaseUrl, supabaseAnonKey } before loading account.js"
      );
    }
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error(
        "Supabase JS not loaded. Include supabase-js@2 script before account.js"
      );
    }

    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    });

    // Stable global for other scripts
    window.supabaseClient = client;

    function setCookie(name, value, maxAgeSeconds) {
      const secure = location.protocol === "https:" ? "; Secure" : "";
      const maxAge =
        typeof maxAgeSeconds === "number" ? `; Max-Age=${maxAgeSeconds}` : "";
      document.cookie = `${name}=${encodeURIComponent(
        value || ""
      )}; Path=/; SameSite=Lax${maxAge}${secure}`;
    }

    function clearCookie(name) {
      const secure = location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${name}=; Path=/; SameSite=Lax; Max-Age=0${secure}`;
    }

    function writeAuthCookies(session) {
      if (!session?.access_token) {
        clearCookie("sb-access-token");
        clearCookie("sb-refresh-token");
        return;
      }

      const oneWeek = 60 * 60 * 24 * 7;
      setCookie("sb-access-token", session.access_token, oneWeek);
      setCookie("sb-refresh-token", session.refresh_token || "", oneWeek);
    }

    // ---- AUTH HELPERS ----
    function isRealUser(user) {
      return !!user && user.is_anonymous === false;
    }

    function isEmailConfirmed(user) {
      // Supabase sets email_confirmed_at when verified
      return !!user?.email_confirmed_at;
    }

    function isLaunchReadyUser(user) {
      return isRealUser(user) && isEmailConfirmed(user);
    }

    async function currentUser() {
      const { data } = await client.auth.getUser();
      return data?.user || null;
    }

    // ✅ FIX: Redirect to Next routes (/login, /verify) instead of login.html
    async function requireLaunchReadyUser(redirectTo) {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;

      const user = data?.session?.user || null;
      const nextPath = window.location.pathname || "/";

      const goLogin = () =>
        window.location.replace(`/login?next=${encodeURIComponent(nextPath)}`);

      const goVerify = () =>
        window.location.replace(`/verify?next=${encodeURIComponent(nextPath)}`);

      const normalizedRedirect = (() => {
        if (!redirectTo) return "";
        const r = String(redirectTo);
        if (r === "login.html" || r === "/login.html") return "/login";
        if (r === "verify.html" || r === "/verify.html") return "/verify";
        return r;
      })();

      if (!user) {
        if (normalizedRedirect) {
          window.location.replace(normalizedRedirect);
        } else {
          goLogin();
        }
        throw new Error("Not signed in");
      }

      if (!isRealUser(user)) {
        if (normalizedRedirect) {
          window.location.replace(normalizedRedirect);
        } else {
          goLogin();
        }
        throw new Error("Guest session not allowed here");
      }

      if (!isEmailConfirmed(user)) {
        if (normalizedRedirect && normalizedRedirect.startsWith("/verify")) {
          window.location.replace(
            `${normalizedRedirect}?next=${encodeURIComponent(nextPath)}`
          );
        } else {
          goVerify();
        }
        throw new Error("Email not confirmed");
      }

      return user;
    }

    async function requireLaunchReadyUserId() {
      const user = await requireLaunchReadyUser();
      if (!user?.id) throw new Error("No authenticated user");
      return user.id;
    }

    function activeProjectKey(userId) {
      return `authored_active_project_id_${userId}`;
    }

    async function ensureIdentity() {
      const { data } = await client.auth.getSession();
      if (data?.session) {
        writeAuthCookies(data.session);
        return data.session;
      }
      writeAuthCookies(null);
      return null;
    }

    client.auth.onAuthStateChange((_event, session) => {
      writeAuthCookies(session || null);
    });

    client.auth.getSession().then(({ data }) => {
      writeAuthCookies(data?.session || null);
      ensureIdentity().catch(() => {});
    });

    window.AuthoredAccount = {
      client,

      isRealUser,
      isEmailConfirmed,
      isLaunchReadyUser,

      async ensureIdentity() {
        return await ensureIdentity();
      },

      async signIn(email, password) {
        const r = await client.auth.signInWithPassword({ email, password });
        return r;
      },

      async signUp(email, password, options = {}) {
        return await client.auth.signUp({
          email,
          password,
          options: options?.emailRedirectTo
            ? { emailRedirectTo: options.emailRedirectTo }
            : undefined
        });
      },

      async signOut() {
        const r = await client.auth.signOut();
        clearCookie("sb-access-token");
        clearCookie("sb-refresh-token");
        return r;
      },

      async getSession() {
        return await client.auth.getSession();
      },

      async getUser() {
        return await client.auth.getUser();
      },

      async convertGuestToEmailPassword(email, password, options = {}) {
        const u = await currentUser();
        if (!u) return { data: null, error: new Error("No session to convert") };
        if (!u.is_anonymous) return { data: { user: u }, error: null };

        const payload = { email, password };
        const opt = options?.emailRedirectTo
          ? { emailRedirectTo: options.emailRedirectTo }
          : undefined;

        const { data, error } = await client.auth.updateUser(payload, opt);
        return { data, error };
      },

      async requireLaunchReadyUser(redirectTo = "/login") {
        try {
          return await requireLaunchReadyUser(redirectTo);
        } catch {
          return null;
        }
      },

      projects: {
        async getActiveProjectId() {
          const userId = await requireLaunchReadyUserId();
          return localStorage.getItem(activeProjectKey(userId)) || "";
        },

        async setActiveProjectId(projectId) {
          const userId = await requireLaunchReadyUserId();
          localStorage.setItem(activeProjectKey(userId), projectId);
        },

        async clearActiveProjectId() {
          const userId = await requireLaunchReadyUserId();
          localStorage.removeItem(activeProjectKey(userId));
        },

        async getProject(projectId) {
          const userId = await requireLaunchReadyUserId();
          const { data, error } = await client
            .from("projects")
            .select("*")
            .eq("id", projectId)
            .eq("user_id", userId)
            .maybeSingle();
          if (error) throw error;
          return data || null;
        },

        async createProject(payload) {
          const userId = await requireLaunchReadyUserId();

          const insertRow = {
            user_id: userId,
            topic: payload.topic,
            audience: payload.audience || null,
            blocker: payload.blocker || null,
            chapters: payload.chapters || 12,
            voice_sample: payload.voiceSample || null,
            voice_notes: payload.voiceNotes || null
          };

          const { data, error } = await client
            .from("projects")
            .insert(insertRow)
            .select("*")
            .single();

          if (error) throw error;
          await this.setActiveProjectId(data.id);
          return data;
        },

        async updateProject(projectId, updates) {
          const userId = await requireLaunchReadyUserId();
          const safe = { ...updates };
          delete safe.user_id;
          delete safe.id;

          const { data, error } = await client
            .from("projects")
            .update(safe)
            .eq("id", projectId)
            .eq("user_id", userId)
            .select("*")
            .single();

          if (error) throw error;
          return data;
        },

        async getOrCreateActiveProject(payload) {
          const userId = await requireLaunchReadyUserId();
          const existingId = localStorage.getItem(activeProjectKey(userId)) || "";

          if (existingId) {
            const existing = await this.getProject(existingId);
            if (existing) {
              return await this.updateProject(existing.id, {
                topic: payload.topic,
                audience: payload.audience || null,
                blocker: payload.blocker || null,
                chapters: payload.chapters || 12,
                voice_sample: payload.voiceSample || null,
                voice_notes: payload.voiceNotes || null
              });
            }
          }

          return await this.createProject(payload);
        }
      }
    };
  } catch (err) {
    console.error("Auth init failed:", err);
    window.AuthoredAccountInitError = String(err?.message || err);
  }
})();