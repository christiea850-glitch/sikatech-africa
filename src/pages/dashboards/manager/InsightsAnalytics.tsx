import type { CSSProperties } from "react";

type Props = {
  styles: Record<string, CSSProperties>;
  insights: any[];
  riskInsightCount: number;
  warningInsightCount: number;
  positiveInsightCount: number;
  insightPriorityRows: any[];
  strongestDepartment: any | null;
  weakestDepartment: any | null;
  weakestGroupedRow: any | null;
  money: (value: number) => string;
  labelize: (value: string) => string;
};

export default function InsightsAnalytics({
  styles,
  insights,
  riskInsightCount,
  warningInsightCount,
  positiveInsightCount,
  insightPriorityRows,
  strongestDepartment,
  weakestDepartment,
  weakestGroupedRow,
  money,
  labelize,
}: Props) {
  return (
    <section style={styles.analyticsPanel}>
      <div style={styles.sectionHeader}>
        <div>
          <h2 style={styles.sectionTitle}>Insight Drilldown Analytics</h2>
          <p style={styles.sectionSubtitle}>
            Recommendation priority, risk balance, and strongest signals for this range.
          </p>
        </div>
        <span style={styles.sectionMeta}>{insights.length} insight{insights.length === 1 ? "" : "s"}</span>
      </div>
      {insights.length === 0 ? (
        <div style={styles.emptyState}>No chartable activity for this range yet.</div>
      ) : (
        <div style={styles.analyticsGrid}>
          <article className="manager-analytics-card" style={styles.visualCard}>
            <h3 style={styles.visualTitle}>Risk vs Opportunity</h3>
            <div style={styles.visualBarStack}>
              {[
                { label: "Risks", value: riskInsightCount, tone: "loss" },
                { label: "Warnings", value: warningInsightCount, tone: "expenses" },
                { label: "Positives", value: positiveInsightCount, tone: "profit" },
              ].map((row) => (
                <div key={row.label} style={styles.visualBarRow}>
                  <div style={styles.visualBarLabel}>{row.label}</div>
                  <div style={styles.visualBarTrack}>
                    <div
                      style={{
                        ...styles.visualBarFill,
                        ...styles[`visualBar${labelize(row.tone)}`],
                        width: `${row.value === 0 ? 0 : Math.max(8, (row.value / Math.max(insights.length, 1)) * 100)}%`,
                      }}
                    />
                  </div>
                  <div style={styles.visualBarValue}>{row.value}</div>
                </div>
              ))}
            </div>
          </article>
          <article className="manager-analytics-card" style={styles.visualCard}>
            <h3 style={styles.visualTitle}>Follow-up Priority</h3>
            <div style={styles.visualBarStack}>
              {insightPriorityRows.map((row) => (
                <div key={row.id} style={styles.visualBarRow}>
                  <div style={styles.visualBarLabel}>{row.title}</div>
                  <div style={styles.visualBarTrack}>
                    <div
                      style={{
                        ...styles.visualBarFill,
                        ...styles[`visualBar${row.type === "risk" ? "Loss" : row.type === "warning" ? "Expenses" : row.type === "positive" ? "Profit" : "Collections"}`],
                        width: `${row.score}%`,
                      }}
                    />
                  </div>
                  <div style={styles.visualBarValue}>{row.score}</div>
                </div>
              ))}
            </div>
          </article>
          <article className="manager-analytics-card" style={styles.visualCard}>
            <h3 style={styles.visualTitle}>Strongest Performer</h3>
            <div style={styles.drilldownFocusValue}>
              {strongestDepartment ? strongestDepartment.name : "No active leader"}
            </div>
            <p style={styles.visualSub}>
              {strongestDepartment
                ? `${money(strongestDepartment.total)} across ${strongestDepartment.transactions} transaction${strongestDepartment.transactions === 1 ? "" : "s"}.`
                : "No chartable activity for this range yet."}
            </p>
          </article>
          <article className="manager-analytics-card" style={styles.visualCard}>
            <h3 style={styles.visualTitle}>Weakest Area</h3>
            <div style={styles.drilldownFocusValue}>
              {weakestDepartment ? weakestDepartment.name : weakestGroupedRow?.name || "No weak area"}
            </div>
            <p style={styles.visualSub}>
              {weakestDepartment
                ? `${weakestDepartment.status} with ${weakestDepartment.transactions} transaction${weakestDepartment.transactions === 1 ? "" : "s"}.`
                : weakestGroupedRow
                  ? `Lowest grouped net: ${money(weakestGroupedRow.netProfit)}.`
                  : "No chartable activity for this range yet."}
            </p>
          </article>
        </div>
      )}
    </section>
  );
}
