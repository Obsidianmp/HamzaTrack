"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { getJson, type SessionResponse } from "@/lib/client-api";

export function LoginForm() {
  const router = useRouter();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const selectedUser = session?.users.find((user) => user.id === selectedUserId) ?? null;
  const requiresAdminPassword = selectedUser?.role === "admin";

  useEffect(() => {
    void getJson<SessionResponse>("/api/session")
      .then((data) => {
        setSession(data);
        setSelectedUserId(data.users[0]?.id ?? "");
      })
      .catch((err) => setError(err.message));
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      try {
        await getJson("/api/login", {
          method: "POST",
          body: JSON.stringify({
            userId: selectedUserId,
            password: requiresAdminPassword ? password : undefined
          })
        });
        router.refresh();
        router.push("/");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Login failed");
      }
    });
  }

  return (
    <div className="container" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div className="panel pad" style={{ width: "min(520px, 100%)" }}>
        <div className="stack">
          <div>
            <h1 className="heading">Contractor Time Tracker</h1>
            <p className="muted" style={{ marginTop: 8 }}>
              Demo login with seeded admin and contractor accounts. Replace with Supabase/Auth later if needed.
            </p>
          </div>

          <form className="stack" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="user">Sign in as</label>
              <select
                id="user"
                className="select"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                disabled={!session}
              >
                {session?.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.role})
                  </option>
                ))}
              </select>
            </div>

            {requiresAdminPassword ? (
              <div className="field">
                <label htmlFor="password">Administrator Password</label>
                <input
                  id="password"
                  type="password"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  autoComplete="current-password"
                  required
                />
              </div>
            ) : null}

            {error ? <div className="error">{error}</div> : null}

            <button
              className="btn primary"
              type="submit"
              disabled={!selectedUserId || pending || (requiresAdminPassword && !password)}
            >
              {pending ? "Signing in..." : "Continue"}
            </button>
          </form>

          <div className="panel pad login-footnote">
            <div className="muted" style={{ fontSize: 14 }}>
              Seeded accounts:
            </div>
            <div style={{ fontSize: 14, marginTop: 6 }}>
              `admin@example.com` (admin), `contractor@example.com` (contractor)
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              Admin login now requires a password.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
