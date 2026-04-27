import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

function formatModule(m?: string) {
  if (!m) return "Module";
  return m
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export default function ModuleLoginPage() {
  const { module } = useParams();
  const navigate = useNavigate();

  const title = useMemo(() => formatModule(module), [module]);

  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // For now: just allow access
    navigate(`/${module}`);
  };

  return (
    <div style={styles.screen}>
      <div style={styles.card}>
        <h1 style={styles.heading}>{title} Access</h1>
        <p style={styles.sub}>Re-enter your credentials to open this module.</p>

        <form onSubmit={onSubmit} style={{ width: "100%" }}>
          <input
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            placeholder="Employee ID"
            style={styles.input}
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            type="password"
            style={styles.input}
          />

          <button type="submit" style={styles.btn}>
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  screen: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#d1a21b",
    padding: 24,
  },
  card: {
    width: "min(640px, 100%)",
    background: "rgba(255,255,255,0.18)",
    borderRadius: 24,
    padding: 28,
    boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
    backdropFilter: "blur(8px)",
    textAlign: "center",
  },
  heading: { margin: 0, fontSize: 38, color: "#0b2a3a" },
  sub: { marginTop: 10, color: "#0b2a3a", fontSize: 16, marginBottom: 18 },
  input: {
    width: "100%",
    padding: "16px 18px",
    borderRadius: 16,
    border: "1px solid rgba(11,42,58,0.25)",
    fontSize: 18,
    outline: "none",
    marginBottom: 14,
  },
  btn: {
    width: "100%",
    padding: "16px 18px",
    borderRadius: 18,
    border: "none",
    cursor: "pointer",
    background: "#0b2a3a",
    color: "white",
    fontSize: 20,
    fontWeight: 900,
  },
};
