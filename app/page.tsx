"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { Session, AuthChangeEvent } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type AlertRow = {
  id: string;
  status: string;
  created_at: string;
  partner_hint: string;
};

function partnerHint(h: string) {
  return `${h.slice(0, 6)}...${h.slice(-4)}`;
}

function AppInner() {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => getSupabaseBrowser(), []);

  const [session, setSession] = useState<Session | null>(null);
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [nickname, setNickname] = useState("");
  const [partner, setPartner] = useState("");
  const [intent, setIntent] = useState("exclusive");
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [authMessage, setAuthMessage] = useState("");
  const [declareMessage, setDeclareMessage] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [loadingDeclare, setLoadingDeclare] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, _session: Session | null) => {
        setSession(_session);
      }
    );
    return () => {
      sub?.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    const code = searchParams.get("code");
    const type = searchParams.get("type");
    if (code && type === "magiclink") {
      supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
        if (error) {
          setAuthMessage("Could not verify magic link.");
        } else {
          setSession(data.session);
          setAuthMessage("Signed in.");
        }
      });
    }
  }, [searchParams, supabase]);

  useEffect(() => {
    if (!session) return;
    loadProfile();
    loadAlerts();
  }, [session]);

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("No session");
    return token;
  }

  async function sendMagicLink() {
    setAuthMessage("");
    setSendingLink(true);
    try {
      const destination = emailOrPhone.trim();
      if (!destination) {
        setAuthMessage("Enter email or phone.");
        return;
      }
      const isEmail = destination.includes("@");
      const redirect = `${window.location.origin}`;
      const result = isEmail
        ? await supabase.auth.signInWithOtp({
            email: destination,
            options: { emailRedirectTo: redirect },
          })
        : await supabase.auth.signInWithOtp({ phone: destination });
      if (result.error) throw result.error;
      setAuthMessage("Magic link/OTP sent. Check inbox.");
    } catch (err) {
      console.error(err);
      setAuthMessage("Failed to start login.");
    } finally {
      setSendingLink(false);
    }
  }

  const loadProfile = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      setNickname(json.profile?.nickname || "");
    } catch (err) {
      console.error(err);
    }
  }, []);

  async function saveProfile() {
    setProfileMessage("");
    try {
      const token = await getToken();
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nickname }),
      });
      if (!res.ok) throw new Error("profile");
      setProfileMessage("Saved.");
    } catch (err) {
      console.error(err);
      setProfileMessage("Failed to save profile.");
    }
  }

  async function declarePartner() {
    setDeclareMessage("");
    setLoadingDeclare(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/declare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ partner, intent }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "declare");
      if (json.overlap) {
        setDeclareMessage("Overlap detected. Check alerts below.");
      } else {
        setDeclareMessage("Saved. No overlap yet.");
      }
      loadAlerts();
    } catch (err) {
      console.error(err);
      setDeclareMessage("Failed to save declaration.");
    } finally {
      setLoadingDeclare(false);
    }
  }

  const loadAlerts = useCallback(async () => {
    setLoadingAlerts(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/alerts", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("alerts");
      const json = await res.json();
      setAlerts(json.alerts || []);
    } catch (err) {
      console.error(err);
      setAlerts([]);
    } finally {
      setLoadingAlerts(false);
    }
  }, []);

  async function markRead() {
    try {
      const token = await getToken();
      await fetch("/api/alerts/read", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      loadAlerts();
    } catch (err) {
      console.error(err);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setAlerts([]);
    setNickname("");
    setPartner("");
  }

  const isAuthed = !!session;

  return (
    <div>
      <div className="nav">
        <div>
          <div className="card-title">
            <h1>Relationship Overlap Check</h1>
            <span className="pill">anon hashed matching</span>
          </div>
          <div className="muted">
            Declare your partner; if they show up elsewhere, you get a generic
            alert.
          </div>
        </div>
        <div className="actions">
          {isAuthed ? (
            <>
              <span className="pill">Signed in</span>
              <button onClick={signOut}>Logout</button>
            </>
          ) : null}
        </div>
      </div>

      {!isAuthed && (
        <section>
          <div className="card-title">
            <h2>Login</h2>
            <span className="pill">Magic link / OTP</span>
          </div>
          <label htmlFor="contact">Email or phone</label>
          <input
            id="contact"
            value={emailOrPhone}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setEmailOrPhone(e.target.value)
            }
            placeholder="you@example.com or +251..."
          />
          <button onClick={sendMagicLink} disabled={sendingLink}>
            {sendingLink ? "Sending…" : "Send link / OTP"}
          </button>
          <div className="muted" style={{ marginTop: 8 }}>
            {authMessage}
          </div>
          <div className="small" style={{ marginTop: 6 }}>
            We email/text a magic link or OTP via Supabase Auth. No passwords.
          </div>
        </section>
      )}

      {isAuthed && (
        <>
          <section>
            <div className="card-title">
              <h2>Your profile</h2>
              <span className="pill">nickname only</span>
            </div>
            <label htmlFor="nickname">Nickname</label>
            <input
              id="nickname"
              value={nickname}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setNickname(e.target.value)
              }
              placeholder="Anonymous Owl"
            />
            <div className="actions" style={{ marginTop: 10 }}>
              <button onClick={saveProfile}>Save</button>
              <span className="muted">{profileMessage}</span>
            </div>
          </section>

          <section>
            <div className="card-title">
              <h2>Declare your partner</h2>
              <span className="pill">hashed & salted</span>
            </div>
            <div className="row">
              <div>
                <label htmlFor="partner">Partner contact (email/phone)</label>
                <input
                  id="partner"
                  value={partner}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setPartner(e.target.value)
                  }
                  placeholder="partner@example.com"
                />
              </div>
              <div>
                <label htmlFor="intent">Intent</label>
                <select
                  id="intent"
                  value={intent}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setIntent(e.target.value)
                  }
                >
                  <option value="exclusive">Exclusive</option>
                  <option value="casual">Casual</option>
                  <option value="unspecified">Unspecified</option>
                </select>
              </div>
            </div>
            <button onClick={declarePartner} disabled={loadingDeclare}>
              {loadingDeclare ? "Saving…" : "Declare partner"}
            </button>
            <div className="muted" style={{ marginTop: 8 }}>
              {declareMessage}
            </div>
            <div className="small" style={{ marginTop: 8 }}>
              We normalize + hash + salt the identifier on the server. Overlaps
              trigger generic alerts; we never show who else declared.
            </div>
          </section>

          <section>
            <div className="card-title">
              <h2>Alerts</h2>
              <span className="pill">overlap signals</span>
            </div>
            {loadingAlerts ? (
              <div className="muted">Loading alerts…</div>
            ) : alerts.length === 0 ? (
              <div className="muted">No alerts yet.</div>
            ) : (
              <>
                {alerts.map((a) => (
                  <div className="alert" key={a.id}>
                    <strong>Potential overlap detected</strong>
                    <div className="muted">
                      Partner hash hint:{" "}
                      {a.partner_hint || partnerHint("unknown")}
                    </div>
                    <div className="muted">
                      {new Date(a.created_at).toLocaleString()}
                    </div>
                    <div
                      className={`badge ${
                        a.status === "new" ? "badge-new" : "badge-read"
                      }`}
                      style={{ marginTop: 6 }}
                    >
                      {a.status === "new" ? "New" : "Read"}
                    </div>
                  </div>
                ))}
                {alerts.some((a) => a.status === "new") && (
                  <button onClick={markRead}>Mark all read</button>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div />}>
      <AppInner />
    </Suspense>
  );
}
