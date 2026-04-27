// src/pages/LoginPage.tsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return employeeId.trim().length > 0 && password.length > 0 && !loading;
  }, [employeeId, password, loading]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const emp = employeeId.trim();
    const pwd = password;

    if (!emp || !pwd) {
      setError("Please enter your Employee ID and Password.");
      return;
    }

    setLoading(true);
    try {
      await login(emp, pwd);
      navigate("/app/dashboard", { replace: true });
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : "Login failed. Try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sk-app-bg" style={styles.page}>
      {/* Tiny CSS animation keyframes */}
      <style>
        {`
          @keyframes skFadeUp {
            from { opacity: 0; transform: translateY(14px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}
      </style>

      <div style={styles.centerWrap}>
        <div style={styles.card}>
          <div style={styles.title}>SikaTech Africa</div>
          <div style={styles.subtitle}>Log in with your employee ID</div>

          {error && (
            <div style={styles.errorBox}>
              <div style={styles.errorTitle}>Login issue</div>
              <div style={styles.errorText}>{error}</div>
            </div>
          )}

          <form onSubmit={onSubmit} style={{ marginTop: 14 }}>
            <label style={styles.label}>Employee ID</label>
            <input
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="e.g., bar01"
              autoComplete="username"
              style={styles.input}
            />

            <div style={{ height: 12 }} />

            <label style={styles.label}>Password</label>
            <div style={styles.passwordRow}>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                style={{ ...styles.input, margin: 0, flex: 1, minWidth: 0 }}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                style={styles.showBtn}
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? "Hide" : "Show"}
              </button>
            </div>

            <button type="submit" disabled={!canSubmit} style={styles.primaryBtn}>
              {loading ? "Signing in..." : "Log In & Access Dashboard"}
            </button>

            <div style={styles.tip}>
              Tip: Use your assigned Employee ID (e.g., <b>bar01</b>) and password.
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "block",
  },

  centerWrap: {
    minHeight: "100vh",
    width: "100%",
    display: "grid",
    placeItems: "center",
    padding: 18,
  },

  card: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 24,
    padding: 22,
    background: "rgba(255,255,255,0.26)",
    border: "1px solid rgba(255,255,255,0.35)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
    backdropFilter: "blur(10px)",
    animation: "skFadeUp 420ms ease-out",
  },

  title: {
    textAlign: "center",
    fontSize: 40,
    fontWeight: 950,
    color: "#0b2a3a",
    letterSpacing: -0.8,
    marginBottom: 4,
  },

  subtitle: {
    textAlign: "center",
    fontWeight: 800,
    color: "rgba(11,42,58,0.78)",
    marginBottom: 10,
  },

  errorBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    background: "rgba(180,38,38,0.10)",
    border: "1px solid rgba(180,38,38,0.20)",
    color: "#8b1f1f",
  },
  errorTitle: { fontWeight: 950, marginBottom: 4 },
  errorText: { fontWeight: 800, opacity: 0.95 },

  label: {
    display: "block",
    fontWeight: 900,
    color: "#0b2a3a",
    marginBottom: 6,
  },

  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid rgba(11,42,58,0.18)",
    outline: "none",
    background: "white",
    fontWeight: 800,
  },

  passwordRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    width: "100%",
  },

  showBtn: {
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid rgba(11,42,58,0.18)",
    background: "rgba(11,42,58,0.06)",
    color: "#0b2a3a",
    fontWeight: 950,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  primaryBtn: {
    width: "100%",
    marginTop: 14,
    padding: "12px 14px",
    borderRadius: 14,
    border: "none",
    background: "#0b2a3a",
    color: "white",
    fontWeight: 950,
    cursor: "pointer",
  },

  tip: {
    marginTop: 10,
    textAlign: "center",
    fontSize: 12,
    fontWeight: 850,
    color: "rgba(11,42,58,0.70)",
  },
};
