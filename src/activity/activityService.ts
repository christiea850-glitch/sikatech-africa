// src/activity/activityService.ts
import type { ActivityEvent, LogActivityInput } from "./activityTypes";
import { readActivities, appendActivity, clearActivities } from "./activityStorage";

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function loadActivities(): ActivityEvent[] {
  const items = readActivities();
  return [...items].sort((a, b) => b.timestamp - a.timestamp);
}

export function logActivity(input: LogActivityInput): ActivityEvent {
  const event: ActivityEvent = {
    id: uid(),
    timestamp: input.timestamp ?? Date.now(),
    actor: input.actor,
    moduleKey: input.moduleKey,
    moduleLabel: input.moduleLabel,
    action: input.action,
    summary: input.summary,
    meta: input.meta,
  };

  // quota-proof (never crashes UI)
  appendActivity(event);

  return event;
}

export function clearAllActivities() {
  clearActivities();
}

