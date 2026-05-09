import type { CSSProperties } from "react";

import ExecutiveAnalyticsExpansion from "./ExecutiveAnalyticsExpansion";
import ManagerVisualIntelligence from "./ManagerVisualIntelligence";

type Props = {
  styles: Record<string, CSSProperties>;
  activeRangeLabel: string;
  groupLabel: string;
  hasVisualActivity: boolean;
  collectionPercent: number;
  totals: {
    revenue: number;
    collections: number;
    netProfit: number;
  };
  financialVisualRows: Array<{ label: string; value: number; tone: string }>;
  maxFinancialVisualValue: number;
  topDepartmentVisualRows: Array<{ key: string; name: string; total: number }>;
  maxDepartmentVisualValue: number;
  groupedVisualRows: Array<{ key: string; name: string; revenue: number; collections: number; expenses: number }>;
  maxGroupedVisualValue: number;
  alertSeverityRows: Array<{ label: string; count: number; tone: string }>;
  maxAlertSeverityCount: number;
  receivablesTotal: number;
  alertsLength: number;
  riskInsightCount: number;
  warningInsightCount: number;
  activeDepartmentPercent: number;
  strongestDepartment: any | null;
  weakestDepartment: any | null;
  money: (value: number) => string;
  labelize: (value: string) => string;
  openDashboardView: (view: any) => void;
};

export default function VisualInsightsHub({
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
  receivablesTotal,
  alertsLength,
  riskInsightCount,
  warningInsightCount,
  activeDepartmentPercent,
  strongestDepartment,
  weakestDepartment,
  money,
  labelize,
  openDashboardView,
}: Props) {
  return (
    <>
      <ManagerVisualIntelligence
        styles={styles}
        activeRangeLabel={activeRangeLabel}
        groupLabel={groupLabel}
        hasVisualActivity={hasVisualActivity}
        collectionPercent={collectionPercent}
        totals={totals}
        financialVisualRows={financialVisualRows}
        maxFinancialVisualValue={maxFinancialVisualValue}
        topDepartmentVisualRows={topDepartmentVisualRows}
        maxDepartmentVisualValue={maxDepartmentVisualValue}
        groupedVisualRows={groupedVisualRows}
        maxGroupedVisualValue={maxGroupedVisualValue}
        alertSeverityRows={alertSeverityRows}
        maxAlertSeverityCount={maxAlertSeverityCount}
        money={money}
        labelize={labelize}
        openDashboardView={openDashboardView}
      />

      <ExecutiveAnalyticsExpansion
        styles={styles}
        hasVisualActivity={hasVisualActivity}
        totals={totals}
        receivablesTotal={receivablesTotal}
        collectionPercent={collectionPercent}
        alertsLength={alertsLength}
        riskInsightCount={riskInsightCount}
        warningInsightCount={warningInsightCount}
        activeDepartmentPercent={activeDepartmentPercent}
        strongestDepartment={strongestDepartment}
        weakestDepartment={weakestDepartment}
        money={money}
        openDashboardView={openDashboardView}
      />
    </>
  );
}
