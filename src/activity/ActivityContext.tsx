import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ActivityEvent, LogActivityInput } from "./activityTypes";
import { loadActivities, logActivity, clearAllActivities } from "./activityService";

type ActivityContextType = {
  activities: ActivityEvent[];
  log: (input: LogActivityInput) => void;
  clear: () => void;
  refresh: () => void;
};

const ActivityContext = createContext<ActivityContextType | undefined>(undefined);

export function ActivityProvider({ children }: { children: ReactNode }) {
  const [activities, setActivities] = useState<ActivityEvent[]>(() => loadActivities());

  const api = useMemo<ActivityContextType>(() => {
    return {
      activities,

      log: (input) => {
        const created = logActivity(input);
        setActivities((prev) => [created, ...prev]);
      },

      clear: () => {
        clearAllActivities();
        setActivities([]);
      },

      refresh: () => {
        setActivities(loadActivities());
      },
    };
  }, [activities]);

  return <ActivityContext.Provider value={api}>{children}</ActivityContext.Provider>;
}

export function useActivity() {
  const ctx = useContext(ActivityContext);
  if (!ctx) throw new Error("useActivity must be used inside ActivityProvider");
  return ctx;
}


