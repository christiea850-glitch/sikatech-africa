import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBusinessSetup, type BusinessType } from "../setup/BusinessSetupContext";

const OPTIONS: { id: BusinessType; label: string }[] = [
  { id: "restaurant_hotel", label: "Restaurant/Hotel" },
  { id: "retail_store", label: "Retail Store" },
  { id: "hair_beauty", label: "Hair & Beauty" },
  { id: "bookshop", label: "Bookshop" },
  { id: "procurement", label: "Procurement" },
  { id: "others", label: "Others" },
];

export default function BusinessTypePage() {
  const navigate = useNavigate();
  const { businessType, setBusinessType } = useBusinessSetup();
  const [selected, setSelected] = useState<BusinessType | null>(businessType);

  const onContinue = () => {
    if (!selected) return;
    setBusinessType(selected);
    navigate("/setup/business-name");
  };

  return (
    <div style={styles.screen}>
      <div style={styles.topBar}>
        <div style={styles.brand}>SikaTech Africa</div>
      </div>

      <div style={styles.container}>
        <h1 style={styles.heading}>Select Your Business Type</h1>

        <div style={styles.grid}>
          {OPTIONS.map((o) => {
            const active = selected === o.id;
            return (
              <button
                key={o.id}
                onClick={() => setSelected(o.id)}
                style={{
                  ...styles.tile,
                  outline: active ? "4px solid rgba(11,42,58,0.35)" : "none",
                }}
              >
                <div style={styles.tileLabel}>{o.label}</div>
              </button>
            );
          })}
        </div>

        <button
          style={{
            ...styles.continueBtn,
            opacity: selected ? 1 : 0.5,
            cursor: selected ? "pointer" : "not-allowed",
          }}
          onClick={onContinue}
          disabled={!selected}
        >
          Select & Continue
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  screen: { minHeight: "100vh", background: "#8c6a07" },
  topBar: { padding: 18, color: "white" },
  brand: { fontWeight: 800, fontSize: 20 },
  container: {
    maxWidth: 980,
    margin: "0 auto",
    padding: "24px 20px 60px",
    textAlign: "center",
  },
  heading: { color: "#0b2a3a", fontSize: 44, margin: "24px 0 24px" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 18,
    marginBottom: 26,
  },
  tile: {
    background: "rgba(255,255,255,0.94)",
    border: "none",
    borderRadius: 22,
    padding: 22,
    minHeight: 140,
    boxShadow: "0 18px 35px rgba(0,0,0,0.25)",
  },
  tileLabel: { fontSize: 22, fontWeight: 800, color: "#0b2a3a" },
  continueBtn: {
    width: "min(520px, 100%)",
    padding: "16px 18px",
    borderRadius: 18,
    border: "none",
    background: "#6c5204",
    color: "white",
    fontSize: 22,
    fontWeight: 900,
  },
};
