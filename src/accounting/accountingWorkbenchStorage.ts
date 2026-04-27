export type AccountingReviewStatus = "unreviewed" | "reviewed" | "issue";

export type AccountingWorkbenchReview = {
  recordId: string;
  status: AccountingReviewStatus;
  note?: string;
  updatedAt: string;
};

const STORAGE_KEY = "sikatech_accounting_workbench_reviews_v1";

export function loadAccountingWorkbenchReviews(): AccountingWorkbenchReview[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AccountingWorkbenchReview[]) : [];
  } catch {
    return [];
  }
}

export function saveAccountingWorkbenchReviews(list: AccountingWorkbenchReview[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function upsertAccountingWorkbenchReview(
  input: Pick<AccountingWorkbenchReview, "recordId" | "status" | "note">
) {
  const existing = loadAccountingWorkbenchReviews();
  const next: AccountingWorkbenchReview = {
    recordId: input.recordId,
    status: input.status,
    note: input.note?.trim() || undefined,
    updatedAt: new Date().toISOString(),
  };

  saveAccountingWorkbenchReviews([
    next,
    ...existing.filter((item) => item.recordId !== input.recordId),
  ]);

  return next;
}
