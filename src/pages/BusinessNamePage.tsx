import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBusinessSetup } from "../setup/BusinessSetupContext";

export default function BusinessNamePage() {
  const navigate = useNavigate();
  const { businessName, setBusinessName } = useBusinessSetup();
  const [name, setName] = useState(businessName);

  const canContinue = useMemo(() => name.trim().length >= 2, [name]);

  const onContinue = () => {
    if (!canContinue) return;
    setBusinessName(name.trim());
    navigate("/login");
  };

  return (
    <div style={styles.screen}>
      <div style={styles.card}>
        <h1 style={styles.heading}>Enter Your Business Name</h1>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., SikaTech Africa"
          style={styles.input}
        />

        <button
          style={{
            ...styles.btn,
            opacity: canContinue ? 1 : 0.5,
            cursor: canContinue ? "pointer" : "not-allowed",
          }}
          disabled={!canContinue}
          onClick={onContinue}
        >
          Continue
        </button>
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
    width: "min(560px, 100%)",
    background: "rgba(255,255,255,0.20)",
    borderRadius: 24,
    padding: 28,
    boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
    backdropFilter: "blur(8px)",
    textAlign: "center",
  },
  heading: { margin: 0, fontSize: 44, color: "#0b2a3a" },
  input: {
    marginTop: 22,
    width: "100%",
    padding: "16px 18px",
    borderRadius: 16,
    border: "1px solid rgba(11,42,58,0.25)",
    fontSize: 20,
    outline: "none",
  },
  btn: {
    marginTop: 18,
    width: "100%",
    padding: "16px 18px",
    borderRadius: 16,
    border: "none",
    cursor: "pointer",
    background: "#b58413",
    color: "#ffffff",
    fontSize: 22,
    fontWeight: 900,
  },
};
