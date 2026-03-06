"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type Plan = "project" | "lifetime";

const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "";

function paypalSdkSrc() {
  const base = "https://www.paypal.com/sdk/js";
  const qs = new URLSearchParams({
    "client-id": PAYPAL_CLIENT_ID,
    currency: "USD",
    intent: "capture",
  });
  return `${base}?${qs.toString()}`;
}

declare global {
  interface Window {
    paypal?: any;
  }
}

export default function PricingPage() {
  const router = useRouter();

  const [warnMsg, setWarnMsg] = useState<string>("");
  const [busyPlan, setBusyPlan] = useState<Plan | null>(null);

  const [token, setToken] = useState<string | null>(null);
  const [paypalReady, setPaypalReady] = useState(false);

  const renderedRef = useRef(false);

  const warn = (msg: string) => setWarnMsg(msg || "");

  useEffect(() => {
    let alive = true;

    async function syncSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        const t = data?.session?.access_token || null;
        if (alive) setToken(t);
      } catch (e: any) {
        warn(e?.message || "Auth error. Please refresh.");
      }
    }

    syncSession();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const t = session?.access_token || null;
      setToken(t);
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const paypalSdkPromise = useMemo(() => {
    let p: Promise<boolean> | null = null;

    return () => {
      if (p) return p;

      if (!PAYPAL_CLIENT_ID) {
        warn("Missing NEXT_PUBLIC_PAYPAL_CLIENT_ID");
        p = Promise.resolve(false);
        return p;
      }

      p = new Promise((resolve) => {
        if (window.paypal?.Buttons) return resolve(true);

        const existing = document.querySelector('script[data-paypal-sdk="1"]') as HTMLScriptElement | null;
        if (existing) {
          existing.addEventListener("load", () => resolve(true), { once: true });
          existing.addEventListener("error", () => resolve(false), { once: true });
          return;
        }

        const s = document.createElement("script");
        s.src = paypalSdkSrc();
        s.async = true;
        s.setAttribute("data-paypal-sdk", "1");
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        document.head.appendChild(s);
      });

      return p;
    };
  }, []);

  async function waitForPayPalButtons(timeoutMs = 15000) {
    const start = Date.now();
    while (!window.paypal?.Buttons) {
      if (Date.now() - start > timeoutMs) return false;
      await new Promise((r) => setTimeout(r, 50));
    }
    return true;
  }

  useEffect(() => {
    if (!token) return;
    if (renderedRef.current) return;

    let cancelled = false;

    (async () => {
      const ok = await paypalSdkPromise();
      if (!ok) {
        warn("PayPal SDK did not load. Check NEXT_PUBLIC_PAYPAL_CLIENT_ID.");
        return;
      }

      const ready = await waitForPayPalButtons();
      if (!ready) {
        warn("PayPal is still loading. Refresh and try again.");
        return;
      }

      if (cancelled) return;

      setPaypalReady(true);

      await renderPayPal("paypalProject", "project", token);
      await renderPayPal("paypalLifetime", "lifetime", token);

      renderedRef.current = true;
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function renderPayPal(containerId: string, plan: Plan, accessToken: string) {
    const host = document.getElementById(containerId);
    if (!host) return;

    host.innerHTML = "";

    if (!window.paypal?.Buttons) {
      warn("PayPal Buttons are unavailable. Refresh the page.");
      return;
    }

    window.paypal
      .Buttons({
        createOrder: async () => {
          const headers = new Headers();
          headers.set("Content-Type", "application/json");
          headers.set("Authorization", `Bearer ${accessToken}`);

          const resp = await fetch("/api/paypal-create-order", {
            method: "POST",
            headers,
            body: JSON.stringify({ plan }),
          });

          const data = await resp.json().catch(() => ({}));
          if (!resp.ok || !data?.orderID) {
            throw new Error(data?.error || "Could not create PayPal order");
          }

          return data.orderID;
        },

        onApprove: async (data: any) => {
          const headers = new Headers();
          headers.set("Content-Type", "application/json");
          headers.set("Authorization", `Bearer ${accessToken}`);

          const resp = await fetch("/api/paypal-capture-order", {
            method: "POST",
            headers,
            body: JSON.stringify({ orderID: data?.orderID }),
          });

          const out = await resp.json().catch(() => ({}));
          if (!resp.ok || !out?.ok) {
            warn(out?.error ? `Unlock failed: ${out.error}` : "Payment captured but unlock failed. Refresh and try again.");
            return;
          }

          router.replace("/start");
        },

        onError: (err: any) => {
          warn("PayPal error: " + (err?.message || String(err)));
        },
      })
      .render(`#${containerId}`);
  }

  function goStripe(plan: Plan) {
    window.location.href =
      plan === "project"
        ? "/api/stripe-create-checkout?plan=project"
        : "/api/stripe-create-checkout?plan=lifetime";
  }

  return (
    <main className="wrap">
      <div className="inner">
        <div className="topbar">
          <Link href="/" className="toplink">
            Home
          </Link>
          <Link href="/pricing" className="toplink active">
            Pricing
          </Link>
          <Link href="/login" className="toplink">
            Log in
          </Link>
          <Link href="/signup" className="toplink primary">
            Start writing
          </Link>
        </div>

        <h1>Choose your Authored plan</h1>
        <p className="muted">
          Start free. Upgrade when you’re ready to expand chapters, keep your voice, and finish the manuscript.
        </p>

        {warnMsg ? <div className="warn">{warnMsg}</div> : null}

        <div className="grid">
          <div className="card freeCard">
            <div className="pill">Start here</div>
            <h2>Free</h2>
            <div className="mutedSm">Try the workflow before you pay</div>
            <div className="price">$0</div>
            <ul>
              <li>Generate outline</li>
              <li>Try the guest flow</li>
              <li>Limited titles, intro, and chapter expansion</li>
              <li>Best for testing the workflow</li>
            </ul>

            <hr className="divider" />

            <div className="row">
              <Link className="btn" href="/guest">
                Try free
              </Link>
              <Link className="btn secondary" href="/signup">
                Create free account
              </Link>
            </div>
          </div>

          <div className="card">
            <div className="pill">Best for one book</div>
            <h2>Project plan</h2>
            <div className="mutedSm">One project, one user</div>
            <div className="price">$49</div>
            <ul>
              <li>Expand chapters</li>
              <li>Regenerate drafts</li>
              <li>DOCX export</li>
              <li>Voice + tone controls</li>
              <li>Best for one serious manuscript</li>
            </ul>

            <hr className="divider" />

            <div className="mutedSm">
              <strong className="strong">Pay with card</strong> (Stripe)
            </div>
            <div className="row">
              <button
                className="btn"
                type="button"
                disabled={!token || busyPlan === "project"}
                onClick={() => {
                  if (!token) {
                    router.push(`/login?next=${encodeURIComponent("/pricing")}`);
                    return;
                  }
                  setBusyPlan("project");
                  goStripe("project");
                }}
              >
                Checkout (Card)
              </button>
            </div>

            <div className="mutedSm" style={{ marginTop: 10 }}>
              <strong className="strong">Pay with PayPal</strong>
            </div>
            <div className="paypalBox" id="paypalProject" />
          </div>

          <div className="card featured">
            <div className="pill accent">Best value</div>
            <h2>Lifetime</h2>
            <div className="mutedSm">All features, one user</div>
            <div className="price">$149</div>
            <ul>
              <li>Unlimited projects</li>
              <li>More expansions</li>
              <li>No project restart friction</li>
              <li>Priority features as Authored grows</li>
              <li>Best long-term option</li>
            </ul>

            <hr className="divider" />

            <div className="mutedSm">
              <strong className="strong">Pay with card</strong> (Stripe)
            </div>
            <div className="row">
              <button
                className="btn"
                type="button"
                disabled={!token || busyPlan === "lifetime"}
                onClick={() => {
                  if (!token) {
                    router.push(`/login?next=${encodeURIComponent("/pricing")}`);
                    return;
                  }
                  setBusyPlan("lifetime");
                  goStripe("lifetime");
                }}
              >
                Checkout (Card)
              </button>
            </div>

            <div className="mutedSm" style={{ marginTop: 10 }}>
              <strong className="strong">Pay with PayPal</strong>
            </div>
            <div className="paypalBox" id="paypalLifetime" />
          </div>
        </div>

        <div className="row bottomRow" style={{ marginTop: 18 }}>
          <Link className="btn secondary" href="/start">
            Back to writing
          </Link>
        </div>

        {!PAYPAL_CLIENT_ID ? (
          <p className="mutedSm" style={{ marginTop: 14 }}>
            Add <strong className="strong">NEXT_PUBLIC_PAYPAL_CLIENT_ID</strong> to your env vars to enable PayPal.
          </p>
        ) : null}

        {PAYPAL_CLIENT_ID && token && !paypalReady ? (
          <p className="mutedSm" style={{ marginTop: 10 }}>
            Loading PayPal…
          </p>
        ) : null}

        {!token ? (
          <p className="mutedSm" style={{ marginTop: 10 }}>
            Log in to purchase Project or Lifetime.
          </p>
        ) : null}
      </div>

      <style jsx>{`
        :global(html),
        :global(body) {
          height: 100%;
        }

        :global(body) {
          margin: 0;
          font-family: Arial, sans-serif;
          color: #fff;
          overflow-x: hidden;
          background: #0b0d12;
        }

        :global(body)::before {
          content: "";
          position: fixed;
          inset: 0;
          z-index: -2;
          background: url("/assets/pricing-hero.webp") center/cover no-repeat;
          transform: scale(1.03);
          filter: saturate(1.05) contrast(1.05);
        }

        :global(body)::after {
          content: "";
          position: fixed;
          inset: 0;
          z-index: -1;
          background: radial-gradient(1000px 700px at 20% 20%, rgba(0, 0, 0, 0.35), rgba(0, 0, 0, 0.76) 70%),
            linear-gradient(180deg, rgba(0, 0, 0, 0.38), rgba(0, 0, 0, 0.72));
          pointer-events: none;
        }

        .wrap {
          max-width: 1180px;
          margin: 60px auto;
          padding: 0 20px;
        }

        .inner {
          width: 100%;
        }

        .topbar {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
          margin-bottom: 20px;
        }

        .toplink {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 14px;
          border-radius: 999px;
          text-decoration: none;
          color: rgba(255, 255, 255, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.04);
          font-weight: 700;
          font-size: 14px;
        }

        .toplink.active {
          border-color: rgba(255, 255, 255, 0.24);
          background: rgba(255, 255, 255, 0.08);
        }

        .toplink.primary {
          background: rgba(255, 255, 255, 0.92);
          color: #0b0d12;
          border-color: rgba(255, 255, 255, 0.18);
        }

        h1 {
          margin: 0 0 10px;
          font-size: 34px;
          font-weight: 900;
          letter-spacing: -0.03em;
          text-shadow: 0 18px 60px rgba(0, 0, 0, 0.55);
        }

        .muted {
          color: rgba(255, 255, 255, 0.78);
          line-height: 1.55;
          margin: 0 0 16px;
          font-size: 14px;
          max-width: 760px;
        }

        .mutedSm {
          color: rgba(255, 255, 255, 0.78);
          font-size: 13px;
          line-height: 1.45;
        }

        .strong {
          color: rgba(255, 255, 255, 0.92);
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
          margin-top: 16px;
        }

        .card {
          border-radius: 18px;
          padding: 18px;
          background: linear-gradient(180deg, rgba(15, 18, 24, 0.55), rgba(15, 18, 24, 0.38));
          border: 1px solid rgba(255, 255, 255, 0.14);
          box-shadow: 0 22px 70px rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(14px);
          min-width: 0;
        }

        .featured {
          border-color: rgba(255, 194, 102, 0.4);
          box-shadow: 0 22px 70px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 194, 102, 0.14) inset;
        }

        .freeCard {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(15, 18, 24, 0.32));
        }

        .pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.92);
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.14);
          margin-bottom: 12px;
        }

        .pill.accent {
          background: rgba(255, 194, 102, 0.14);
          border-color: rgba(255, 194, 102, 0.32);
          color: #ffd08a;
        }

        .card h2 {
          margin: 0;
          font-size: 22px;
          letter-spacing: -0.01em;
        }

        .price {
          font-size: 38px;
          font-weight: 900;
          margin: 10px 0 8px;
          letter-spacing: -0.02em;
        }

        ul {
          padding-left: 18px;
          margin: 10px 0 0;
          color: rgba(255, 255, 255, 0.86);
        }

        li {
          margin: 8px 0;
          line-height: 1.5;
        }

        .btn {
          padding: 11px 14px;
          border-radius: 12px;
          cursor: pointer;
          font-weight: 900;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.92);
          color: #0b0d12;
          transition: transform 0.12s ease, filter 0.12s ease;
          min-height: 44px;
        }

        .btn:hover {
          transform: translateY(-1px);
          filter: brightness(1.02);
        }

        .btn:active {
          transform: translateY(0px) scale(0.99);
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn.secondary {
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.92);
          border-color: rgba(255, 255, 255, 0.18);
        }

        .row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
          margin-top: 12px;
        }

        .bottomRow {
          justify-content: flex-start;
        }

        .divider {
          margin: 14px 0;
          border: none;
          border-top: 1px solid rgba(255, 255, 255, 0.12);
        }

        .paypalBox {
          margin-top: 10px;
          border-radius: 12px;
          overflow: hidden;
        }

        .warn {
          background: rgba(255, 220, 140, 0.14);
          border: 1px solid rgba(255, 220, 140, 0.25);
          padding: 10px 12px;
          border-radius: 14px;
          color: rgba(255, 255, 255, 0.92);
          margin-top: 12px;
          backdrop-filter: blur(10px);
        }

        @media (max-width: 960px) {
          .grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .wrap {
            margin: 26px auto;
            padding: 0 16px;
          }

          .topbar {
            gap: 8px;
          }

          .toplink {
            flex: 1 1 calc(50% - 8px);
            text-align: center;
          }

          h1 {
            font-size: 28px;
          }

          .muted {
            font-size: 13px;
          }

          .grid {
            gap: 12px;
          }

          .card {
            padding: 14px;
          }

          .btn {
            width: 100%;
          }

          .row {
            width: 100%;
          }

          .bottomRow {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}