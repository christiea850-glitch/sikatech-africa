import type { CSSProperties } from "react";

type DecisionCard = {
  title: string;
  text: string;
  status: string;
  tone: string;
  actionLabel: string;
  target: any;
};

type Props = {
  styles: Record<string, CSSProperties>;
  cards: DecisionCard[];
  dataConfidenceLabel: string;
  businessHealthTone: string;
  alertStyle: (tone: any) => CSSProperties;
  openDashboardView: (view: any) => void;
};

export default function ManagerDecisionCenter({
  styles,
  cards,
  dataConfidenceLabel,
  businessHealthTone,
  alertStyle,
  openDashboardView,
}: Props) {
  return (
    <section style={styles.decisionCenter} aria-label="Manager Decision Center">
      <div style={styles.sectionHeader}>
        <div>
          <h2 style={styles.sectionTitle}>Manager Decision Center</h2>
          <p style={styles.sectionSubtitle}>
            Fast read on attention areas, strengths, next action, and data confidence.
          </p>
        </div>
        <span style={{ ...styles.badge, ...alertStyle(businessHealthTone) }}>
          {dataConfidenceLabel}
        </span>
      </div>
      <div style={styles.decisionGrid}>
        {cards.map((card) => (
          <article key={card.title} style={styles.decisionCard}>
            <div style={styles.decisionCardTop}>
              <h3 style={styles.decisionTitle}>{card.title}</h3>
              <span style={{ ...styles.decisionPill, ...alertStyle(card.tone) }}>
                {card.status}
              </span>
            </div>
            <p style={styles.decisionText}>{card.text}</p>
            <button
              type="button"
              style={styles.decisionButton}
              onClick={() => openDashboardView(card.target)}
            >
              {card.actionLabel}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
