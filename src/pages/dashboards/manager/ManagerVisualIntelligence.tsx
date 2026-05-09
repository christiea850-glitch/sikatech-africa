import type { CSSProperties } from "react";

type Props = {
  styles: Record<string, CSSProperties>;
  activeRangeLabel: string;
  groupLabel: string;
  hasVisualActivity: boolean;
  collectionPercent: number;
  totals: { revenue: number; collections: number };
  financialVisualRows: Array<{ label: string; value: number; tone: string }>;
  maxFinancialVisualValue: number;
  topDepartmentVisualRows: Array<{ key: string; name: string; total: number }>;
  maxDepartmentVisualValue: number;
  groupedVisualRows: Array<{ key: string; name: string; revenue: number; collections: number; expenses: number }>;
  maxGroupedVisualValue: number;
  alertSeverityRows: Array<{ label: string; count: number; tone: string }>;
  maxAlertSeverityCount: number;
  money: (value: number) => string;
  labelize: (value: string) => string;
  openDashboardView: (view: any) => void;
};

export default function ManagerVisualIntelligence({
  styles,
  activeRangeLabel,
  groupLabel,
  hasVisualActivity,
  collectionPercent,
  totals,
  financialVisualRows,
  maxFinancialVisualValue,
  topDepartmentVisualRows,
  maxDepartmentVisualValue,
  groupedVisualRows,
  maxGroupedVisualValue,
  alertSeverityRows,
  maxAlertSeverityCount,
  money,
  labelize,
  openDashboardView,
}: Props) {
  return (
    <section style={styles.visualIntelligence} aria-label="Manager Visual Intelligence">
      <div style={styles.sectionHeader}>
        <div>
          <h2 style={styles.sectionTitle}>Manager Visual Intelligence</h2>
          <p style={styles.sectionSubtitle}>
            Visual readout for {activeRangeLabel} using current dashboard data.
          </p>
        </div>
        <span style={styles.sectionMeta}>Grouped by {groupLabel}</span>
      </div>

      {!hasVisualActivity ? (
        <div style={styles.emptyState}>No chartable activity for this range yet.</div>
      ) : (
        <div style={styles.visualGrid}>
          <article className="manager-visual-card" style={styles.visualCard}>
            <div style={styles.visualCardHeader}>
              <div>
                <h3 style={styles.visualTitle}>Revenue vs Collections</h3>
                <p style={styles.visualSub}>Collection coverage against recorded revenue.</p>
              </div>
              <button type="button" style={styles.visualLinkButton} onClick={() => openDashboardView("sales-summary")}>
                Sales Summary
              </button>
            </div>
            <div style={styles.collectionTrack}>
              <div style={{ ...styles.collectionFill, width: `${Math.max(4, collectionPercent)}%` }} />
            </div>
            <div style={styles.visualSplit}>
              <span>Revenue: {money(totals.revenue)}</span>
              <span>Collections: {money(totals.collections)}</span>
              <strong>{collectionPercent.toFixed(0)}%</strong>
            </div>
          </article>

          <article className="manager-visual-card" style={styles.visualCard}>
            <h3 style={styles.visualTitle}>Revenue / Expenses / Net Profit</h3>
            <div style={styles.visualBarStack}>
              {financialVisualRows.map((row) => (
                <div key={row.label} style={styles.visualBarRow}>
                  <div style={styles.visualBarLabel}>{row.label}</div>
                  <div style={styles.visualBarTrack}>
                    <div
                      style={{
                        ...styles.visualBarFill,
                        ...styles[`visualBar${labelize(row.tone)}`],
                        width: `${Math.max(4, (Math.abs(row.value) / maxFinancialVisualValue) * 100)}%`,
                      }}
                    />
                  </div>
                  <div style={styles.visualBarValue}>{money(row.value)}</div>
                </div>
              ))}
            </div>
          </article>

          <article className="manager-visual-card" style={styles.visualCard}>
            <div style={styles.visualCardHeader}>
              <div>
                <h3 style={styles.visualTitle}>Department Performance</h3>
                <p style={styles.visualSub}>Top active departments by sales.</p>
              </div>
              <button type="button" style={styles.visualLinkButton} onClick={() => openDashboardView("department-activity")}>
                Departments
              </button>
            </div>
            {topDepartmentVisualRows.length === 0 ? (
              <div style={styles.visualEmpty}>No chartable activity for this range yet.</div>
            ) : (
              <div style={styles.miniColumnChart}>
                {topDepartmentVisualRows.map((department) => (
                  <div key={department.key} style={styles.miniColumnItem}>
                    <div style={styles.miniColumnFrame}>
                      <div
                        style={{
                          ...styles.miniColumnFill,
                          height: `${Math.max(8, (department.total / maxDepartmentVisualValue) * 100)}%`,
                        }}
                      />
                    </div>
                    <div style={styles.miniColumnLabel}>{department.name}</div>
                    <div style={styles.miniColumnValue}>{money(department.total)}</div>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="manager-visual-card" style={styles.visualCard}>
            <div style={styles.visualCardHeader}>
              <div>
                <h3 style={styles.visualTitle}>{groupLabel} Distribution</h3>
                <p style={styles.visualSub}>Top grouped rows by current grouping.</p>
              </div>
              <button type="button" style={styles.visualLinkButton} onClick={() => openDashboardView("sales-summary")}>
                Details
              </button>
            </div>
            {groupedVisualRows.length === 0 ? (
              <div style={styles.visualEmpty}>No chartable activity for this range yet.</div>
            ) : (
              <div style={styles.visualBarStack}>
                {groupedVisualRows.map((row) => {
                  const value = row.revenue || row.collections || row.expenses;

                  return (
                    <div key={row.key} style={styles.visualBarRow}>
                      <div style={styles.visualBarLabel}>{row.name}</div>
                      <div style={styles.visualBarTrack}>
                        <div
                          style={{
                            ...styles.visualBarFill,
                            ...styles.visualBarCollections,
                            width: `${Math.max(4, (value / maxGroupedVisualValue) * 100)}%`,
                          }}
                        />
                      </div>
                      <div style={styles.visualBarValue}>{money(value)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </article>

          <article className="manager-visual-card" style={styles.visualCard}>
            <div style={styles.visualCardHeader}>
              <div>
                <h3 style={styles.visualTitle}>Alert Severity</h3>
                <p style={styles.visualSub}>Current alert mix for manager review.</p>
              </div>
              <button type="button" style={styles.visualLinkButton} onClick={() => openDashboardView("alerts")}>
                Alerts
              </button>
            </div>
            <div style={styles.visualBarStack}>
              {alertSeverityRows.map((row) => (
                <div key={row.label} style={styles.visualBarRow}>
                  <div style={styles.visualBarLabel}>{row.label}</div>
                  <div style={styles.visualBarTrack}>
                    <div
                      style={{
                        ...styles.visualBarFill,
                        ...styles[`visualBar${labelize(row.tone)}`],
                        width: `${row.count === 0 ? 0 : Math.max(8, (row.count / maxAlertSeverityCount) * 100)}%`,
                      }}
                    />
                  </div>
                  <div style={styles.visualBarValue}>{row.count}</div>
                </div>
              ))}
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
