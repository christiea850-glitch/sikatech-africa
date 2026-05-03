import type { CSSProperties, ReactNode } from "react";

type FocusedViewPanelProps = {
  title: string;
  subtitle?: string;
  onBack: () => void;
  children: ReactNode;
};

// Reusable in-page drill-down shell. Later phases can use this for dashboard,
// notification, and accounting drilldowns without creating new routes.
export default function FocusedViewPanel({
  title,
  subtitle,
  onBack,
  children,
}: FocusedViewPanelProps) {
  return (
    <section style={styles.panel}>
      <button type="button" style={styles.backButton} onClick={onBack}>
        ← Back
      </button>
      <div style={styles.title}>{title}</div>
      {subtitle ? <div style={styles.subtitle}>{subtitle}</div> : null}
      <div style={styles.content}>{children}</div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: {
    padding: 14,
    borderRadius: 8,
    background: "#ffffff",
    border: "1px solid rgba(11,42,58,0.10)",
  },
  backButton: {
    border: "1px solid rgba(11,42,58,0.18)",
    background: "#ffffff",
    color: "#0b2a3a",
    borderRadius: 8,
    padding: "9px 12px",
    cursor: "pointer",
    fontWeight: 900,
    marginBottom: 12,
  },
  title: {
    color: "#0b2a3a",
    fontSize: 22,
    fontWeight: 900,
  },
  subtitle: {
    marginTop: 4,
    color: "#64748b",
    fontWeight: 800,
  },
  content: {
    marginTop: 12,
  },
};
