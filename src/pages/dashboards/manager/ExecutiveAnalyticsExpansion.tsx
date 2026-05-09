import type { CSSProperties } from "react";

type Props = {
  styles: Record<string, CSSProperties>;
  hasVisualActivity: boolean;
  totals: {
    revenue: number;
    collections: number;
    netProfit: number;
  };
  receivablesTotal: number;
  collectionPercent: number;
  alertsLength: number;
  riskInsightCount: number;
  warningInsightCount: number;
  activeDepartmentPercent: number;
  strongestDepartment: any | null;
  weakestDepartment: any | null;
  money: (value: number) => string;
  openDashboardView: (view: any) => void;
};

export default function ExecutiveAnalyticsExpansion({
  styles,
  hasVisualActivity,
  totals,
  receivablesTotal,
  collectionPercent,
  alertsLength,
  riskInsightCount,
  warningInsightCount,
  activeDepartmentPercent,
  strongestDepartment,
  weakestDepartment,
  money,
  openDashboardView,
}: Props) {
  const hasRevenueSignal = totals.revenue !== 0 || totals.collections !== 0 || totals.netProfit !== 0;
  const riskPressureCount = alertsLength + riskInsightCount + warningInsightCount;
  const hasDepartmentSignal = Boolean(strongestDepartment || weakestDepartment || activeDepartmentPercent > 0);

  const revenueTone =
    totals.netProfit > 0 ? "Positive operating movement" : totals.revenue > 0 ? "Margin needs review" : "No movement yet";
  const collectionTone =
    collectionPercent >= 90 ? "Collections are keeping pace" : collectionPercent > 0 ? "Collection gap visible" : "No collection signal";
  const riskTone =
    riskPressureCount > 0 ? "Review pressure points" : "No elevated pressure";
  const departmentTone =
    strongestDepartment ? "Momentum is concentrated" : activeDepartmentPercent > 0 ? "Activity is distributed" : "No department signal";

  return (
    <section style={styles.executiveAnalytics} aria-label="Executive Analytics Expansion">
      <div style={styles.sectionHeader}>
        <div>
          <h2 style={styles.sectionTitle}>Executive Analytics Expansion</h2>
          <p style={styles.sectionSubtitle}>
            Movement, pressure, and action priority from the current dashboard signals.
          </p>
        </div>
      </div>

      {!hasVisualActivity ? (
        <div style={styles.emptyState}>No chartable activity for this range yet.</div>
      ) : (
        <div style={styles.executiveAnalyticsGrid}>
          <article className="manager-analytics-card" style={styles.executiveAnalyticsCard}>
            <div style={styles.executiveAnalyticsTopline}>
              <h3 style={styles.visualTitle}>Revenue Movement / Trend Read</h3>
              <span style={styles.executiveAnalyticsPill}>{revenueTone}</span>
            </div>
            <p style={styles.executiveAnalyticsText}>
              {hasRevenueSignal
                ? totals.netProfit >= 0
                  ? "Revenue activity is translating into a positive operating read for this range."
                  : "Revenue is present, but the margin read suggests a closer look at grouped performance."
                : "No revenue movement is visible for this selected range yet."}
            </p>
            <div style={styles.executiveAnalyticsMeter} title={`Net profit: ${money(totals.netProfit)}`}>
              <div
                className="manager-visual-fill"
                style={{
                  ...styles.executiveAnalyticsMeterFill,
                  ...styles.visualBarRevenue,
                  width: `${hasRevenueSignal ? Math.max(12, totals.netProfit >= 0 ? 72 : 42) : 0}%`,
                }}
              />
            </div>
            {hasRevenueSignal ? (
              <button type="button" style={styles.visualLinkButton} onClick={() => openDashboardView("sales-summary")}>
                Sales Summary
              </button>
            ) : null}
          </article>

          <article className="manager-analytics-card" style={styles.executiveAnalyticsCard}>
            <div style={styles.executiveAnalyticsTopline}>
              <h3 style={styles.visualTitle}>Collection Efficiency</h3>
              <span style={styles.executiveAnalyticsPill}>{collectionTone}</span>
            </div>
            <p style={styles.executiveAnalyticsText}>
              {totals.revenue > 0
                ? receivablesTotal > 0
                  ? "Collections are moving against recorded revenue, while receivables remain visible."
                  : "Collections are keeping the cash position aligned with recorded revenue."
                : "No revenue base is available for a collection efficiency read yet."}
            </p>
            <div style={styles.collectionTrack} title={`Collection coverage: ${collectionPercent.toFixed(0)}%`}>
              <div
                className="manager-visual-fill"
                style={{ ...styles.collectionFill, width: `${totals.revenue > 0 ? Math.max(4, collectionPercent) : 0}%` }}
              />
            </div>
            {totals.revenue > 0 ? (
              <button type="button" style={styles.visualLinkButton} onClick={() => openDashboardView("sales-summary")}>
                Sales Summary
              </button>
            ) : null}
          </article>

          <article className="manager-analytics-card" style={styles.executiveAnalyticsCard}>
            <div style={styles.executiveAnalyticsTopline}>
              <h3 style={styles.visualTitle}>Risk Pressure</h3>
              <span style={styles.executiveAnalyticsPill}>{riskTone}</span>
            </div>
            <p style={styles.executiveAnalyticsText}>
              {riskPressureCount > 0
                ? "Current alerts and insight pressure suggest manager review should stay focused on exception handling."
                : "No elevated alert or insight pressure is visible for this range."}
            </p>
            <div style={styles.visualInsightRow} title={`${alertsLength} alerts, ${riskInsightCount} risks, ${warningInsightCount} warnings`}>
              <span>Pressure signals</span>
              <strong>{riskPressureCount}</strong>
            </div>
            {riskPressureCount > 0 ? (
              <button type="button" style={styles.visualLinkButton} onClick={() => openDashboardView("alerts")}>
                Alerts
              </button>
            ) : null}
          </article>

          <article className="manager-analytics-card" style={styles.executiveAnalyticsCard}>
            <div style={styles.executiveAnalyticsTopline}>
              <h3 style={styles.visualTitle}>Department Momentum</h3>
              <span style={styles.executiveAnalyticsPill}>{departmentTone}</span>
            </div>
            <p style={styles.executiveAnalyticsText}>
              {hasDepartmentSignal
                ? strongestDepartment
                  ? `${strongestDepartment.name} is carrying the strongest department signal for the selected range.`
                  : "Department activity is present, but no single leader stands out yet."
                : "No department movement is visible for this selected range yet."}
            </p>
            <div style={styles.collectionTrack} title={`Active department coverage: ${activeDepartmentPercent.toFixed(0)}%`}>
              <div
                className="manager-visual-fill"
                style={{ ...styles.collectionFill, width: `${hasDepartmentSignal ? Math.max(4, activeDepartmentPercent) : 0}%` }}
              />
            </div>
            {hasDepartmentSignal ? (
              <button type="button" style={styles.visualLinkButton} onClick={() => openDashboardView("department-activity")}>
                Department Activity
              </button>
            ) : null}
          </article>
        </div>
      )}
    </section>
  );
}
