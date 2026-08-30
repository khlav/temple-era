// Single source of truth for every top-level page surfaced in navigation (the header's "Guild
// Tools" menu and the Cmd/Ctrl+K global quick launcher). Both consumers import this list instead
// of keeping their own copy, so a new page can't go missing from one without the other, and
// visibility is driven by the same `requiredScope` check the destination page's own layout/route
// guard enforces server-side — not by the coarser legacy `isRaidManager`/`isAdmin` booleans, which
// bundle several unrelated scopes together and would show a link a given scope-holder can't
// actually open.
import {
  Home,
  Calendar,
  Users,
  BookOpen,
  ClipboardList,
  BarChart3,
  FilePlus,
  DraftingCompass,
  ListRestart,
  ScanLine,
  ShieldCheck,
  Flame,
  Trophy,
  Award,
  type LucideIcon,
} from "lucide-react";

import { SCOPE, type Scope } from "~/lib/scopes";

export interface AppPage {
  name: string;
  path: string;
  icon: LucideIcon;
  /** Badge shown next to restricted pages; undefined for pages open to every visitor. */
  area?: string;
  /** Scope required to view this page — must match the destination's own layout/route guard. */
  requiredScope?: Scope;
}

export const APP_PAGES: AppPage[] = [
  { name: "Dashboard", path: "/", icon: Home },
  { name: "Raids", path: "/raids", icon: Calendar },
  { name: "Raid Plans", path: "/raid-plans", icon: ClipboardList },
  { name: "Raiding characters", path: "/characters", icon: Users },
  { name: "Rare recipes & crafters", path: "/rare-recipes", icon: BookOpen },
  { name: "World Buffs", path: "/world-buffs", icon: Flame },
  { name: "Attendance reports", path: "/reports/attendance", icon: BarChart3 },
  { name: "Achievements", path: "/achievements", icon: Trophy },
  {
    name: "Create new raid",
    path: "/raids/new",
    icon: FilePlus,
    area: "Raid Manager",
    requiredScope: SCOPE.RAIDLOG_MANAGE,
  },
  {
    name: "Raid planner",
    path: "/raid-manager/raid-planner",
    icon: DraftingCompass,
    area: "Raid Manager",
    requiredScope: SCOPE.RAIDPLAN_MANAGE,
  },
  {
    name: "Manage Mains <-> Alts",
    path: "/raid-manager/characters",
    icon: Users,
    area: "Raid Manager",
    requiredScope: SCOPE.RAIDPLAN_MANAGE,
  },
  {
    name: "Refresh WCL log",
    path: "/raid-manager/log-refresh",
    icon: ListRestart,
    area: "Raid Manager",
    requiredScope: SCOPE.RAIDPLAN_MANAGE,
  },
  {
    name: "Scan Softres",
    path: "/softres",
    icon: ScanLine,
    area: "Raid Manager",
    requiredScope: SCOPE.SOFTRES_ACCESS,
  },
  {
    name: "User permissions",
    path: "/admin/user-management",
    icon: ShieldCheck,
    area: "Admin",
    requiredScope: SCOPE.USERPERMISSIONS_MANAGE,
  },
  {
    name: "Manage achievements",
    path: "/achievements/manage",
    icon: Award,
    area: "Admin",
    requiredScope: SCOPE.ACHIEVEMENT_MANAGE,
  },
];

/** Pages visible to a user holding the given scopes — public pages plus any scope match. */
export function getVisiblePages(scopes: readonly Scope[] | undefined | null): AppPage[] {
  return APP_PAGES.filter(
    (page) => !page.requiredScope || (scopes?.includes(page.requiredScope) ?? false),
  );
}
