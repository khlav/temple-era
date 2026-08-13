import { Separator } from "~/components/ui/separator";
import { SubmitAvailabilityForm } from "~/components/world-buffs/submit-availability-form";
import { AssignmentList } from "~/components/world-buffs/assignment-list";
import { WorldBuffQueueList } from "~/components/world-buffs/world-buff-queue-list";
import { ScheduleDialogProvider } from "~/components/world-buffs/schedule-dialog-context";
import { WORLD_BUFF_ITEM, type WorldBuffItem } from "~/lib/world-buffs";

// Display-only grouping for the queue-list cards: Onyxia's Head and Nefarian's Head both grant
// Dragon, so they're combined into one card here even though the data stays per-item.
const QUEUE_LIST_GROUPS: { key: string; items: WorldBuffItem[]; title?: string }[] = [
  { key: WORLD_BUFF_ITEM.RENDS_HEAD, items: [WORLD_BUFF_ITEM.RENDS_HEAD] },
  {
    key: "dragon",
    items: [WORLD_BUFF_ITEM.ONYXIAS_HEAD, WORLD_BUFF_ITEM.NEFARIANS_HEAD],
    title: "Onyxia/Nefarian's Head",
  },
  { key: WORLD_BUFF_ITEM.HAKKARS_HEART, items: [WORLD_BUFF_ITEM.HAKKARS_HEART] },
];

export function WorldBuffDashboard() {
  return (
    <ScheduleDialogProvider>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SubmitAvailabilityForm />
          <AssignmentList />
        </div>
        <Separator />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {QUEUE_LIST_GROUPS.map((group) => (
            <WorldBuffQueueList key={group.key} items={group.items} title={group.title} />
          ))}
        </div>
      </div>
    </ScheduleDialogProvider>
  );
}
