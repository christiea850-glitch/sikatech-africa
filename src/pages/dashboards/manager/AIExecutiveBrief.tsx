import type { CSSProperties } from "react";

type BriefTone = "healthy" | "watch" | "risk" | "opportunity";

type BriefItem = {
  text: string;
  tone: BriefTone;
};

type Props = {
  styles: Record<string, CSSProperties>;
  items: BriefItem[];
};

function toneLabel(tone: BriefTone) {
  if (tone === "healthy") return "Healthy";
  if (tone === "risk") return "Risk";
  if (tone === "opportunity") return "Opportunity";
  return "Watch";
}

export default function AIExecutiveBrief({ styles, items }: Props) {
  return (
    <section style={styles.aiBrief} aria-label="AI Executive Brief">
      <div style={styles.sectionHeader}>
        <div>
          <h2 style={styles.sectionTitle}>AI Executive Brief</h2>
          <p style={styles.sectionSubtitle}>
            Deterministic manager observations from the current dashboard signals.
          </p>
        </div>
        <span style={styles.aiBriefBadge}>Read-only</span>
      </div>

      {items.length === 0 ? (
        <div style={styles.emptyState}>No meaningful insight signals for this range yet.</div>
      ) : (
        <div style={styles.aiBriefGrid}>
          {items.map((item, index) => (
            <article key={`${item.tone}-${index}`} className="manager-analytics-card" style={styles.aiBriefCard}>
              <span style={{ ...styles.aiBriefPill, ...styles[`aiBriefPill${toneLabel(item.tone)}`] }}>
                {toneLabel(item.tone)}
              </span>
              <p style={styles.aiBriefText}>{item.text}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
