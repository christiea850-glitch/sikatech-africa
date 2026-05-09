import type { ComponentType, CSSProperties } from "react";

type DetailMetricProps = { label: string; value: string };

type Props = {
  styles: Record<string, CSSProperties>;
  groupLabel: string;
  groupedRows: any[];
  totals: { revenue: number; collections: number };
  collectionGap: number;
  maxFinancialVisualValue: number;
  groupedRankingRows: any[];
  maxGroupedRevenue: number;
  weakestGroupedRow: any | null;
  DetailMetric: ComponentType<DetailMetricProps>;
  money: (value: number) => string;
  labelize: (value: string) => string;
};

export default function SalesSummaryAnalytics({
  styles,
  groupLabel,
  groupedRows,
  totals,
  collectionGap,
  maxFinancialVisualValue,
  groupedRankingRows,
  maxGroupedRevenue,
  weakestGroupedRow,
  DetailMetric,
  money,
  labelize,
}: Props) {
  return (
    <section style={styles.analyticsPanel}>
      <div style={styles.sectionHeader}>
        <div>
          <h2 style={styles.sectionTitle}>Sales Summary Drilldown Analytics</h2>
          <p style={styles.sectionSubtitle}>
            Grouped ranking, collection gaps, and performance spread for the current view.
          </p>
        </div>
        <span style={styles.sectionMeta}>Grouped by {groupLabel}</span>
      </div>
      {groupedRows.length === 0 ? (
        <div style={styles.emptyState}>No chartable activity for this range yet.</div>
      ) : (
        <div style={styles.analyticsGrid}>
          <article className="manager-analytics-card" style={styles.visualCard}>
            <h3 style={styles.visualTitle}>Revenue vs Collections Gap</h3>
            <div style={styles.visualLegend}>
              <span style={styles.visualLegendItem}>
                <span style={{ ...styles.visualLegendDot, ...styles.visualBarRevenue }} />
                Revenue
              </span>
              <span style={styles.visualLegendItem}>
                <span style={{ ...styles.visualLegendDot, ...styles.visualBarCollections }} />
                Collections
              </span>
              <span style={styles.visualLegendItem}>
                <span
                  style={{
                    ...styles.visualLegendDot,
                    ...(collectionGap > 0 ? styles.visualBarExpenses : styles.visualBarProfit),
                  }}
                />
                Gap
              </span>
            </div>
            <div style={styles.visualBarStack}>
              {[
                { label: "Revenue", value: totals.revenue, tone: "revenue" },
                { label: "Collections", value: totals.collections, tone: "collections" },
                { label: "Gap", value: collectionGap, tone: collectionGap > 0 ? "expenses" : "profit" },
              ].map((row) => (
                <div
                  key={row.label}
                  className="manager-visual-row"
                  style={styles.visualBarRow}
                  title={`${row.label}: ${money(row.value)}`}
                >
                  <div style={styles.visualBarLabel}>{row.label}</div>
                  <div style={styles.visualBarTrack}>
                    <div
                      className="manager-visual-fill"
                      style={{
                        ...styles.visualBarFill,
                        ...styles[`visualBar${labelize(row.tone)}`],
                        width: `${row.value === 0 ? 0 : Math.max(6, (row.value / maxFinancialVisualValue) * 100)}%`,
                      }}
                    />
                  </div>
                  <div style={styles.visualBarValue}>{money(row.value)}</div>
                </div>
              ))}
            </div>
            <div style={styles.visualInsightRow}>
              <span>Collection status</span>
              <strong>{collectionGap > 0 ? "Gap open" : "Covered"}</strong>
            </div>
          </article>
          <article className="manager-analytics-card" style={styles.visualCard}>
            <h3 style={styles.visualTitle}>Grouped Ranking</h3>
            <div style={styles.visualBarStack}>
              {groupedRankingRows.map((row) => (
                <div
                  key={row.key}
                  className="manager-visual-row"
                  style={styles.visualBarRow}
                  title={`${row.name}: ${money(row.revenue)} revenue`}
                >
                  <div style={styles.visualBarLabel}>{row.name}</div>
                  <div style={styles.visualBarTrack}>
                    <div
                      className="manager-visual-fill"
                      style={{
                        ...styles.visualBarFill,
                        ...styles.visualBarRevenue,
                        width: `${row.revenue === 0 ? 0 : Math.max(6, (row.revenue / maxGroupedRevenue) * 100)}%`,
                      }}
                    />
                  </div>
                  <div style={styles.visualBarValue}>{money(row.revenue)}</div>
                </div>
              ))}
            </div>
            {groupedRankingRows[0] ? (
              <div style={styles.visualInsightRow}>
                <span>Leading {groupLabel.toLowerCase()}</span>
                <strong>{groupedRankingRows[0].name}</strong>
              </div>
            ) : null}
          </article>
          <article className="manager-analytics-card" style={styles.visualCard}>
            <h3 style={styles.visualTitle}>Top vs Lowest Performance</h3>
            <div style={styles.drilldownMetricGrid}>
              <DetailMetric
                label="Top Group"
                value={groupedRows[0] ? `${groupedRows[0].name}: ${money(groupedRows[0].netProfit)}` : "None"}
              />
              <DetailMetric
                label="Lowest Group"
                value={weakestGroupedRow ? `${weakestGroupedRow.name}: ${money(weakestGroupedRow.netProfit)}` : "None"}
              />
            </div>
          </article>
          <article className="manager-analytics-card" style={styles.visualCard}>
            <h3 style={styles.visualTitle}>Trend-style Rows</h3>
            <div style={styles.drilldownList}>
              {groupedRankingRows.slice(0, 5).map((row) => (
                <div
                  key={row.key}
                  style={styles.drilldownListRow}
                  title={`${row.name}: collections ${money(row.collections)}, expenses ${money(row.expenses)}`}
                >
                  <span>{row.name}</span>
                  <strong>{row.collections >= row.expenses ? "Healthy" : "Review"}</strong>
                </div>
              ))}
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
