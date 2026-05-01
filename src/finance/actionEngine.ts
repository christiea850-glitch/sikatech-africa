import type { CanonicalLedgerEntry } from "./financialLedger";
import { normalizeDepartmentKey } from "../lib/departments";

export type RecommendedActionSeverity = "high" | "medium" | "low";

export type ActionSuggestion = {
  id: string;
  title: string;
  description: string;
  severity: RecommendedActionSeverity;
  departmentKey?: string;
};

export type RecommendedAction = ActionSuggestion;

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function formatDepartment(value: string) {
  return normalizeDepartmentKey(value)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function generateRecommendedActions(
  ledgerEntries: CanonicalLedgerEntry[]
): ActionSuggestion[] {
  const departmentMap = new Map<
    string,
    { revenue: number; collections: number; receivables: number; expenses: number; count: number }
  >();

  for (const entry of ledgerEntries) {
    const departmentKey = normalizeDepartmentKey(entry.departmentKey || "unknown");
    const current =
      departmentMap.get(departmentKey) || {
        revenue: 0,
        collections: 0,
        receivables: 0,
        expenses: 0,
        count: 0,
      };

    current.revenue += Number(entry.revenueAmount) || 0;
    current.collections += Number(entry.collectionAmount) || 0;
    current.receivables += Number(entry.receivableAmount) || 0;
    current.expenses += Number(entry.expenseAmount) || 0;
    current.count += 1;
    departmentMap.set(departmentKey, current);
  }

  const actions: ActionSuggestion[] = [];

  for (const [departmentKey, totals] of departmentMap.entries()) {
    const revenue = roundMoney(totals.revenue);
    const collections = roundMoney(totals.collections);
    const expenses = roundMoney(totals.expenses);
    const net = roundMoney(revenue - expenses);
    const label = formatDepartment(departmentKey);

    if (net < 0) {
      actions.push({
        id: `reduce-loss:${departmentKey}`,
        title: `Reduce loss in ${label}`,
        description: `${label} is down ${Math.abs(net).toFixed(2)}. Review large expenses and adjust pricing or volume.`,
        severity: "high",
        departmentKey,
      });
    }

    if (revenue > 0 && collections / revenue < 0.7) {
      actions.push({
        id: `improve-collections:${departmentKey}`,
        title: `Improve collections in ${label}`,
        description: `${label} has collected ${Math.round((collections / revenue) * 100)}% of revenue. Follow up on outstanding payments.`,
        severity: "medium",
        departmentKey,
      });
    }

    if (expenses > 0 && revenue > 0 && expenses / revenue > 0.6) {
      actions.push({
        id: `audit-expenses:${departmentKey}`,
        title: `Audit expenses in ${label}`,
        description: `${label} expenses are ${Math.round((expenses / revenue) * 100)}% of revenue. Check recent expense categories and approvals.`,
        severity: "medium",
        departmentKey,
      });
    }

    if (revenue > 0 && net / revenue > 0.5) {
      actions.push({
        id: `scale-performance:${departmentKey}`,
        title: `Scale ${label} performance`,
        description: `${label} is generating a strong margin. Preserve the current operating pattern and consider scaling it.`,
        severity: "low",
        departmentKey,
      });
    }
  }

  const severityRank: Record<RecommendedActionSeverity, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  return actions
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
    .slice(0, 6);
}
