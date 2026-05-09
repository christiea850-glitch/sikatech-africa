import type { CSSProperties } from "react";

type BriefTone = "healthy" | "watch" | "risk" | "opportunity";

type BriefItem = {
  id?: string;
  title?: string;
  text: string;
  tone: BriefTone;
};

type Props = {
  styles: Record<string, CSSProperties>;
  items: BriefItem[];
  activeItemId?: string | null;
  onSelectItem?: (item: BriefItem) => void;
};

function toneLabel(tone: BriefTone) {
  if (tone === "healthy") return "Healthy";
  if (tone === "risk") return "Risk";
  if (tone === "opportunity") return "Opportunity";
  return "Watch";
}

export default function AIExecutiveBrief({
  styles,
  items,
  activeItemId,
  onSelectItem,
}: Props) {
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
          {items.map((item, index) => {
            const active = Boolean(item.id && activeItemId === item.id);
            const cardStyle = {
              ...styles.aiBriefCard,
              ...(onSelectItem ? styles.aiBriefCardButton : {}),
              ...(active ? styles.intelligenceCardActive : {}),
            };
            const content = (
              <>
              <span style={{ ...styles.aiBriefPill, ...styles[`aiBriefPill${toneLabel(item.tone)}`] }}>
                {toneLabel(item.tone)}
              </span>
              <p style={styles.aiBriefText}>{item.text}</p>
              </>
            );

            return onSelectItem ? (
              <button
                key={item.id || `${item.tone}-${index}`}
                type="button"
                className="manager-analytics-card"
                style={cardStyle}
                onClick={() => onSelectItem(item)}
                aria-pressed={active}
                aria-label={`Open evidence for ${item.title || item.text}`}
              >
                {content}
              </button>
            ) : (
              <article
                key={item.id || `${item.tone}-${index}`}
                className="manager-analytics-card"
                style={cardStyle}
              >
                {content}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
