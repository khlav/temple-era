// Pure date logic — lives in ~/lib so client components can import it without pulling in the
// server tree. Re-exported here since server-side callers (e.g. world-buff-service) already
// import from this path.
export {
  type LockoutWeek,
  getTuesdayAnchoredWeekStart,
  getLockoutWeeks,
} from "~/lib/lockout-weeks";
