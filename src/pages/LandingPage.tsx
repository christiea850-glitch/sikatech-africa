import { useNavigate } from "react-router-dom";
import { useBusinessSetup } from "../setup/BusinessSetupContext";

export default function LandingPage() {
  const navigate = useNavigate();
  const { isSetupComplete } = useBusinessSetup();

  return (
    <div style={styles.screen}>
      <div style={styles.card}>
        <h1 style={styles.title}>SikaTech Africa</h1>
        <p style={styles.subtitle}>Login or signup to continue.</p>

        <button
          style={styles.primaryBtn}
          onClick={() => {
            // If business setup is done, go to login, else go to setup flow
            navigate(isSetupComplete ? "/login" : "/setup/business-type");
          }}
        >
          Login
        </button>

        <button
          style={styles.secondaryBtn}
          onClick={() => navigate("/setup/business-type")}
        >
          Sign Up
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
    width: "min(520px, 100%)",
    background: "rgba(255,255,255,0.15)",
    borderRadius: 24,
    padding: 28,
    boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
    backdropFilter: "blur(8px)",
    textAlign: "center",
  },
  title: { margin: 0, fontSize: 44, color: "#0b2a3a" },
  subtitle: { marginTop: 10, marginBottom: 24, color: "#0b2a3a", fontSize: 18 },
  primaryBtn: {
    width: "100%",
    padding: "16px 18px",
    borderRadius: 16,
    border: "none",
    cursor: "pointer",
    background: "#ffffff",
    color: "#0b2a3a",
    fontSize: 20,
    fontWeight: 800,
    marginBottom: 14,
  },
  secondaryBtn: {
    width: "100%",
    padding: "16px 18px",
    borderRadius: 16,
    border: "none",
    cursor: "pointer",
    background: "#b58413",
    color: "#ffffff",
    fontSize: 20,
    fontWeight: 800,
  },
};

