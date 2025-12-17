"use client";

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type {
  Session,
  AuthChangeEvent,
  SupabaseClient,
} from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type AlertRow = {
  id: string;
  status: string;
  created_at: string;
  partner_hint: string;
  overlap_count?: number;
  intents?: string[];
  last_active?: string;
  room_id?: string;
};

function partnerHint(h: string) {
  return `${h.slice(0, 6)}...${h.slice(-4)}`;
}

interface Message {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

function ChatWindow({
  roomId,
  onClose,
  supabase,
  userId,
}: {
  roomId: string;
  onClose: () => void;
  supabase: SupabaseClient;
  userId: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Load initial messages
    const fetchMessages = async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });
      if (data) setMessages(data);
    };
    fetchMessages();

    // Subscribe to new messages
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          setMessages((prev) => [...prev, payload.new as unknown as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, supabase]);

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    const { error } = await supabase
      .from("chat_messages")
      .insert({ room_id: roomId, content: newMessage, user_id: userId });

    if (!error) {
      setNewMessage("");
    } else {
      console.error(error);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal chat-modal">
        <div className="modal-header">
          <h3>Anonymous Chat</h3>
          <button
            onClick={onClose}
            className="secondary"
            style={{ padding: "6px 12px" }}
          >
            Close
          </button>
        </div>
        <div className="messages-list">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`message ${m.user_id === userId ? "mine" : "theirs"}`}
            >
              {m.content}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div className="chat-input">
          <input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Type a message..."
          />
          <button onClick={sendMessage}>Send</button>
        </div>
      </div>
    </div>
  );
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
  const [otpCode, setOtpCode] = useState("");
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [activeChatRoom, setActiveChatRoom] = useState<string | null>(null);

  const [globalStats, setGlobalStats] = useState<{
    total_overlaps: number;
    total_declarations: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((res) => res.json())
      .then((data) => setGlobalStats(data))
      .catch(console.error);
  }, []);

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

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("No session");
    return token;
  }, [supabase]);

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

      if (isEmail) {
        const { error } = await supabase.auth.signInWithOtp({
          email: destination,
          options: { emailRedirectTo: redirect },
        });
        if (error) throw error;
        setAuthMessage("Magic link sent. Check inbox.");
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          phone: destination,
        });
        if (error) throw error;
        setAuthMessage("OTP sent. Enter code below.");
        setShowOtpInput(true);
      }
    } catch (err) {
      console.error(err);
      setAuthMessage("Failed to start login.");
    } finally {
      setSendingLink(false);
    }
  }

  async function verifyOtp() {
    setAuthMessage("");
    setSendingLink(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: emailOrPhone,
        token: otpCode,
        type: "sms",
      });
      if (error) throw error;
      setSession(data.session);
      setAuthMessage("Signed in.");
    } catch (err) {
      console.error(err);
      setAuthMessage("Invalid code.");
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
  }, [getToken]);

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
      setIsPro(!!json.is_pro);
    } catch (err) {
      console.error(err);
      setAlerts([]);
    } finally {
      setLoadingAlerts(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (!session) return;
    loadProfile();
    loadAlerts();
  }, [session, loadProfile, loadAlerts]);

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

  async function upgradeAccount() {
    try {
      const token = await getToken();
      const res = await fetch("/api/upgrade", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setIsPro(json.is_pro);
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
          {globalStats && (
            <div
              className="stats-bar"
              style={{
                marginTop: 10,
                display: "flex",
                gap: 15,
                fontSize: "0.9em",
              }}
            >
              <span
                className="pill"
                style={{ background: "#ff4444", color: "white" }}
              >
                🔥 {globalStats.total_overlaps} Overlaps Detected
              </span>
              <span className="pill">
                📊 {globalStats.total_declarations} Declarations
              </span>
            </div>
          )}
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
          {!showOtpInput ? (
            <>
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
            </>
          ) : (
            <>
              <label htmlFor="otp">Enter SMS Code</label>
              <input
                id="otp"
                value={otpCode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setOtpCode(e.target.value)
                }
                placeholder="123456"
              />
              <div className="actions" style={{ marginTop: 10 }}>
                <button onClick={verifyOtp} disabled={sendingLink}>
                  {sendingLink ? "Verifying…" : "Verify Code"}
                </button>
                <button
                  className="secondary"
                  onClick={() => setShowOtpInput(false)}
                >
                  Back
                </button>
              </div>
            </>
          )}
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
                      style={{
                        marginTop: 10,
                        padding: 10,
                        background: "#f5f5f5",
                        borderRadius: 6,
                      }}
                    >
                      {isPro ? (
                        <div className="small">
                          <div>
                            <strong>Overlap Count:</strong> {a.overlap_count}{" "}
                            others
                          </div>
                          <div>
                            <strong>Intents:</strong>{" "}
                            {a.intents?.join(", ") || "Unknown"}
                          </div>
                          <div>
                            <strong>Last Active:</strong>{" "}
                            {a.last_active
                              ? new Date(a.last_active).toLocaleDateString()
                              : "N/A"}
                          </div>
                        </div>
                      ) : (
                        <div style={{ position: "relative" }}>
                          <div
                            className="small muted"
                            style={{
                              filter: "blur(4px)",
                              userSelect: "none",
                              opacity: 0.6,
                            }}
                          >
                            <div>
                              <strong>Overlap Count:</strong> 3 others
                            </div>
                            <div>
                              <strong>Intents:</strong> Exclusive, Casual
                            </div>
                            <div>
                              <strong>Last Active:</strong> 2 days ago
                            </div>
                          </div>
                          <div
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <button
                              className="secondary"
                              onClick={upgradeAccount}
                              style={{
                                background: "white",
                                border: "1px solid #ccc",
                                fontSize: "0.8em",
                              }}
                            >
                              🔒 Unlock Details
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <div
                        className={`badge ${
                          a.status === "new" ? "badge-new" : "badge-read"
                        }`}
                      >
                        {a.status === "new" ? "New" : "Read"}
                      </div>
                      {a.room_id && (
                        <button
                          onClick={() => setActiveChatRoom(a.room_id!)}
                          style={{ padding: "4px 10px", fontSize: "0.8em" }}
                        >
                          💬 Chat
                        </button>
                      )}
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
      {activeChatRoom && session && (
        <ChatWindow
          roomId={activeChatRoom}
          onClose={() => setActiveChatRoom(null)}
          supabase={supabase}
          userId={session.user.id}
        />
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
