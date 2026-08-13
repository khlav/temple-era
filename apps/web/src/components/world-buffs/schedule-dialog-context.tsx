"use client";

import { createContext, useCallback, useContext, useRef, type ReactNode } from "react";

type OpenScheduleFn = (statusId: string) => void;

interface ScheduleDialogContextValue {
  /** Called by a queue-list row's clock icon to open AssignmentList's schedule dialog,
   *  pre-filled for that character/item at the next available slot. A no-op until
   *  AssignmentList has mounted and registered its handler. */
  openScheduleFor: OpenScheduleFn;
  registerHandler: (fn: OpenScheduleFn) => void;
}

const ScheduleDialogContext = createContext<ScheduleDialogContextValue | null>(null);

/**
 * Bridges the "+ Schedule" dialog (owned by AssignmentList) to the per-item queue lists
 * (WorldBuffQueueList) so a queue row's clock icon can open it pre-filled, even though the
 * two are unrelated siblings under WorldBuffDashboard rather than parent/child.
 */
export function ScheduleDialogProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<OpenScheduleFn | null>(null);

  const registerHandler = useCallback((fn: OpenScheduleFn) => {
    handlerRef.current = fn;
  }, []);

  const openScheduleFor = useCallback((statusId: string) => {
    handlerRef.current?.(statusId);
  }, []);

  return (
    <ScheduleDialogContext.Provider value={{ openScheduleFor, registerHandler }}>
      {children}
    </ScheduleDialogContext.Provider>
  );
}

export function useScheduleDialog() {
  const ctx = useContext(ScheduleDialogContext);
  if (!ctx) {
    throw new Error("useScheduleDialog must be used within a ScheduleDialogProvider");
  }
  return ctx;
}
