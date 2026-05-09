import type { CSSProperties } from "react";

type IntelligenceSection = {
  title: string;
  text: string;
  target: any;
};

type Props = {
  styles: Record<string, CSSProperties>;
  sections: IntelligenceSection[];
  activeView: any;
  labelize: (value: string) => string;
  openDashboardView: (view: any) => void;
  openDashboardViewWithReturn?: (view: any, fromLabel: string) => void;
};

export default function ManagerIntelligenceSections({
  styles,
  sections,
  activeView,
  labelize,
  openDashboardView,
  openDashboardViewWithReturn,
}: Props) {
  return (
    <section style={styles.intelligenceNav} aria-label="Manager Intelligence Sections">
      <div style={styles.sectionHeader}>
        <div>
          <h2 style={styles.sectionTitle}>Manager Intelligence Sections</h2>
          <p style={styles.sectionSubtitle}>
            Choose the exact manager view to review without leaving this dashboard.
          </p>
        </div>
        <span style={styles.sectionMeta}>View: {labelize(activeView)}</span>
      </div>
      <div style={styles.intelligenceGrid}>
        {sections.map((section) => {
          const active = activeView === section.target;

          return (
            <button
              key={section.target}
              type="button"
              style={{
                ...styles.intelligenceCard,
                ...(active ? styles.intelligenceCardActive : {}),
              }}
              onClick={() => {
                if (active) {
                  openDashboardView(section.target);
                  return;
                }

                if (openDashboardViewWithReturn) {
                  openDashboardViewWithReturn(section.target, labelize(activeView));
                  return;
                }

                openDashboardView(section.target);
              }}
              aria-current={active ? "page" : undefined}
            >
              <span style={styles.intelligenceTitle}>{section.title}</span>
              <span style={styles.intelligenceText}>{section.text}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
