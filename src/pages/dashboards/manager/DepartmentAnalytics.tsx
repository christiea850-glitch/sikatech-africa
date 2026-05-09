import type { CSSProperties } from "react";

type Props = {
  styles: Record<string, CSSProperties>;
  departmentPerformance: any[];
  departmentRankingRows: any[];
  activeDepartments: number;
  enabledDepartmentsLength: number;
  quietDepartments: number;
  activeDepartmentPercent: number;
  maxDepartmentTotal: number;
  maxDepartmentTransactions: number;
  money: (value: number) => string;
};

export default function DepartmentAnalytics({
  styles,
  departmentPerformance,
  departmentRankingRows,
  activeDepartments,
  enabledDepartmentsLength,
  quietDepartments,
  activeDepartmentPercent,
  maxDepartmentTotal,
  maxDepartmentTransactions,
  money,
}: Props) {
  return (
    <section style={styles.analyticsPanel}>
      <div style={styles.sectionHeader}>
        <div>
          <h2 style={styles.sectionTitle}>Department Drilldown Analytics</h2>
          <p style={styles.sectionSubtitle}>
            Contribution, activity ranking, and operational load by department.
          </p>
        </div>
        <span style={styles.sectionMeta}>{activeDepartments}/{enabledDepartmentsLength} active</span>
      </div>
      {departmentPerformance.length === 0 ? (
        <div style={styles.emptyState}>No chartable activity for this range yet.</div>
      ) : (
        <div style={styles.analyticsGrid}>
          <article className="manager-analytics-card" style={styles.visualCard}>
            <h3 style={styles.visualTitle}>Active vs Quiet Departments</h3>
            <div style={styles.collectionTrack}>
              <div
                className="manager-visual-fill"
                title={`${activeDepartments} of ${enabledDepartmentsLength} departments active`}
                style={{ ...styles.collectionFill, width: `${Math.max(4, activeDepartmentPercent)}%` }}
              />
            </div>
            <div style={styles.visualLegend}>
              <span style={styles.visualLegendItem}>
                <span style={{ ...styles.visualLegendDot, background: "#0f5e7a" }} />
                Active
              </span>
              <span style={styles.visualLegendItem}>
                <span style={{ ...styles.visualLegendDot, background: "#e8eef3" }} />
                Quiet
              </span>
            </div>
            <div style={styles.visualSplit}>
              <span>Active: {activeDepartments}</span>
              <span>Quiet: {quietDepartments}</span>
              <strong>{activeDepartmentPercent.toFixed(0)}%</strong>
            </div>
          </article>
          <article className="manager-analytics-card" style={styles.visualCard}>
            <h3 style={styles.visualTitle}>Department Contribution</h3>
            <div style={styles.visualBarStack}>
              {departmentRankingRows.slice(0, 6).map((department) => (
                <div
                  key={department.key}
                  className="manager-visual-row"
                  style={styles.visualBarRow}
                  title={`${department.name}: ${money(department.total)}`}
                >
                  <div style={styles.visualBarLabel}>{department.name}</div>
                  <div style={styles.visualBarTrack}>
                    <div
                      className="manager-visual-fill"
                      style={{
                        ...styles.visualBarFill,
                        ...styles.visualBarRevenue,
                        width: `${department.total === 0 ? 0 : Math.max(6, (department.total / maxDepartmentTotal) * 100)}%`,
                      }}
                    />
                  </div>
                  <div style={styles.visualBarValue}>{money(department.total)}</div>
                </div>
              ))}
            </div>
            {departmentRankingRows[0] ? (
              <div style={styles.visualInsightRow}>
                <span>Top contributor</span>
                <strong>{departmentRankingRows[0].name}</strong>
              </div>
            ) : null}
          </article>
          <article className="manager-analytics-card" style={styles.visualCard}>
            <h3 style={styles.visualTitle}>Operational Load</h3>
            <div style={styles.visualBarStack}>
              {departmentRankingRows.slice(0, 6).map((department) => (
                <div
                  key={department.key}
                  className="manager-visual-row"
                  style={styles.visualBarRow}
                  title={`${department.name}: ${department.transactions} transaction${department.transactions === 1 ? "" : "s"}`}
                >
                  <div style={styles.visualBarLabel}>{department.name}</div>
                  <div style={styles.visualBarTrack}>
                    <div
                      className="manager-visual-fill"
                      style={{
                        ...styles.visualBarFill,
                        ...styles.visualBarCollections,
                        width: `${department.transactions === 0 ? 0 : Math.max(6, (department.transactions / maxDepartmentTransactions) * 100)}%`,
                      }}
                    />
                  </div>
                  <div style={styles.visualBarValue}>{department.transactions}</div>
                </div>
              ))}
            </div>
          </article>
          <article className="manager-analytics-card" style={styles.visualCard}>
            <h3 style={styles.visualTitle}>Department Activity Ranking</h3>
            <div style={styles.drilldownList}>
              {departmentRankingRows.slice(0, 5).map((department, index) => (
                <div
                  key={department.key}
                  style={styles.drilldownListRow}
                  title={`${department.name}: ${department.status}`}
                >
                  <span>#{index + 1} {department.name}</span>
                  <strong>{department.status}</strong>
                </div>
              ))}
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
