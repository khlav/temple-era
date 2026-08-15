import { afterEach, describe, expect, it, vi } from "vitest";

const mockFindFirstStatus = vi.fn();
const mockFindFirstAssignment = vi.fn();
const mockInsertReturning = vi.fn();
const mockUpdateCall = vi.fn();
const mockUpdateReturning = vi.fn();
const mockDeleteReturning = vi.fn();

vi.mock("~/server/db", () => ({
  db: {
    query: {
      worldBuffCharacterStatus: {
        findFirst: (...args: unknown[]) => mockFindFirstStatus(...args),
        findMany: vi.fn(),
      },
      worldBuffAssignments: {
        findFirst: (...args: unknown[]) => mockFindFirstAssignment(...args),
        findMany: vi.fn(),
      },
    },
    // Used by `reactivateFamiliesAfterRaid`'s two nested subqueries — never actually executed
    // in these tests, since the mocked `update` below ignores its `.where()` argument entirely.
    // Only needs to not throw while the (unexecuted) subquery expression gets built.
    select: () => ({ from: () => ({ where: () => [] }) }),
    insert: () => ({
      values: () => ({
        returning: () => mockInsertReturning(),
      }),
    }),
    update: (...args: unknown[]) => {
      mockUpdateCall(...args);
      return {
        set: () => ({
          where: () => ({
            returning: () => mockUpdateReturning(),
          }),
        }),
      };
    },
    delete: () => ({
      where: () => ({
        returning: () => mockDeleteReturning(),
      }),
    }),
  },
}));

const {
  submitAvailability,
  setState,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  deleteStatus,
  getAssignmentById,
  reactivateFamiliesAfterRaid,
  WorldBuffServiceError,
} = await import("~/server/services/world-buff-service");

describe("world-buff-service", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("submitAvailability", () => {
    it("creates a new row when none exists for (characterName, item)", async () => {
      mockFindFirstStatus.mockResolvedValue(undefined);
      mockInsertReturning.mockResolvedValue([
        {
          id: "s1",
          characterName: "Dunckan",
          item: "rends_head",
          state: "ready_to_drop",
          queueType: "main",
        },
      ]);

      const result = await submitAvailability({
        characterName: "  Dunckan  ",
        item: "rends_head",
        actingUserId: "u1",
      });

      expect(result.characterName).toBe("Dunckan");
      expect(mockInsertReturning).toHaveBeenCalledTimes(1);
      expect(mockUpdateReturning).not.toHaveBeenCalled();
    });

    it("is idempotent: resubmitting an existing (characterName, item) updates instead of inserting", async () => {
      mockFindFirstStatus.mockResolvedValue({
        id: "s1",
        characterName: "dunckan",
        characterNameNormalized: "dunckan",
        item: "rends_head",
        state: "dropped",
        queueType: "main",
        notes: null,
      });
      mockUpdateReturning.mockResolvedValue([
        {
          id: "s1",
          characterName: "Dunckan",
          item: "rends_head",
          state: "dropped",
          queueType: "backup",
        },
      ]);

      const result = await submitAvailability({
        characterName: "Dunckan",
        item: "rends_head",
        queueType: "backup",
        actingUserId: "u1",
      });

      expect(mockUpdateReturning).toHaveBeenCalledTimes(1);
      expect(mockInsertReturning).not.toHaveBeenCalled();
      // A resubmission never un-drops a lifetime completion — only queueType/notes change.
      expect(result.state).toBe("dropped");
    });
  });

  describe("setState", () => {
    it("throws NOT_FOUND when the status row doesn't exist", async () => {
      mockFindFirstStatus.mockResolvedValue(undefined);

      await expect(
        setState({ statusId: "missing", state: "dropped", actingUserId: "u1", source: "web" }),
      ).rejects.toThrow(WorldBuffServiceError);
    });

    it("transitions ready_to_drop -> dropped and stamps droppedAt", async () => {
      mockFindFirstStatus.mockResolvedValue({ id: "s1", state: "ready_to_drop" });
      mockUpdateReturning.mockResolvedValue([
        { id: "s1", state: "dropped", droppedAt: new Date("2026-08-12T00:00:00Z") },
      ]);

      const result = await setState({
        statusId: "s1",
        state: "dropped",
        actingUserId: "u1",
        source: "web",
      });

      expect(result.state).toBe("dropped");
      expect(result.droppedAt).not.toBeNull();
    });

    it("clears droppedAt when reverted back to ready_to_drop", async () => {
      mockFindFirstStatus.mockResolvedValue({ id: "s1", state: "dropped" });
      mockUpdateReturning.mockResolvedValue([
        { id: "s1", state: "ready_to_drop", droppedAt: null },
      ]);

      const result = await setState({
        statusId: "s1",
        state: "ready_to_drop",
        actingUserId: "u1",
        source: "web",
      });

      expect(result.state).toBe("ready_to_drop");
      expect(result.droppedAt).toBeNull();
    });
  });

  describe("createAssignment", () => {
    it("throws CONFLICT when the item has already been dropped", async () => {
      mockFindFirstStatus.mockResolvedValue({ id: "s1", state: "dropped" });

      await expect(
        createAssignment({ statusId: "s1", scheduledAt: new Date(), actingUserId: "u1" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(mockInsertReturning).not.toHaveBeenCalled();
    });

    it("succeeds when the status is ready_to_drop", async () => {
      mockFindFirstStatus.mockResolvedValue({ id: "s1", state: "ready_to_drop" });
      mockInsertReturning.mockResolvedValue([{ id: "a1", statusId: "s1" }]);

      const result = await createAssignment({
        statusId: "s1",
        scheduledAt: new Date(),
        actingUserId: "u1",
      });

      expect(result.id).toBe("a1");
    });

    it("throws NOT_FOUND when the status row doesn't exist", async () => {
      mockFindFirstStatus.mockResolvedValue(undefined);

      await expect(
        createAssignment({ statusId: "missing", scheduledAt: new Date(), actingUserId: "u1" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("updateAssignment", () => {
    it("throws NOT_FOUND when the assignment doesn't exist", async () => {
      mockFindFirstAssignment.mockResolvedValue(undefined);

      await expect(
        updateAssignment({ assignmentId: "missing", actingUserId: "u1" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("throws CONFLICT when re-linking to a status that's already dropped", async () => {
      mockFindFirstAssignment.mockResolvedValue({ id: "a1", statusId: "s1" });
      mockFindFirstStatus.mockResolvedValue({ id: "s2", state: "dropped" });

      await expect(
        updateAssignment({ assignmentId: "a1", statusId: "s2", actingUserId: "u1" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(mockUpdateReturning).not.toHaveBeenCalled();
    });

    it("updates scheduledAt and notes on an existing assignment", async () => {
      mockFindFirstAssignment.mockResolvedValue({
        id: "a1",
        statusId: "s1",
        scheduledAt: new Date("2026-08-18T23:00:00Z"),
        notes: null,
      });
      const newDate = new Date("2026-08-25T23:00:00Z");
      mockUpdateReturning.mockResolvedValue([
        { id: "a1", statusId: "s1", scheduledAt: newDate, notes: "rescheduled" },
      ]);

      const result = await updateAssignment({
        assignmentId: "a1",
        scheduledAt: newDate,
        notes: "rescheduled",
        actingUserId: "u1",
      });

      expect(result.scheduledAt).toEqual(newDate);
      expect(result.notes).toBe("rescheduled");
    });
  });

  describe("getAssignmentById", () => {
    it("throws NOT_FOUND when the assignment doesn't exist", async () => {
      mockFindFirstAssignment.mockResolvedValue(undefined);

      await expect(getAssignmentById("missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("returns the assignment with its nested status, unenriched when characterId is null", async () => {
      mockFindFirstAssignment.mockResolvedValue({
        id: "a1",
        statusId: "s1",
        scheduledAt: new Date("2026-08-18T23:00:00Z"),
        status: { id: "s1", characterName: "Dunckan", characterId: null },
      });

      const result = await getAssignmentById("a1");

      expect(result.id).toBe("a1");
      expect(result.status.characterClass).toBeNull();
      expect(result.status.primaryCharacterName).toBeNull();
    });
  });

  describe("deleteAssignment", () => {
    it("throws NOT_FOUND when the assignment doesn't exist", async () => {
      mockDeleteReturning.mockResolvedValue([]);

      await expect(deleteAssignment({ assignmentId: "missing" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("deletes an existing assignment", async () => {
      mockDeleteReturning.mockResolvedValue([{ id: "a1" }]);

      const result = await deleteAssignment({ assignmentId: "a1" });

      expect(result.id).toBe("a1");
    });
  });

  describe("reactivateFamiliesAfterRaid", () => {
    it("does nothing when no characters attended", async () => {
      await reactivateFamiliesAfterRaid({
        characterIds: [],
        raidDate: new Date("2026-08-15T00:00:00Z"),
        actingUserId: "u1",
      });

      expect(mockUpdateCall).not.toHaveBeenCalled();
    });

    it("issues a single UPDATE for the raided characters' families", async () => {
      await reactivateFamiliesAfterRaid({
        characterIds: [2, 2, 5],
        raidDate: new Date("2026-08-15T00:00:00Z"),
        actingUserId: "u1",
      });

      // One round trip regardless of roster size: family resolution happens via nested
      // subqueries inside this single UPDATE, not as separate SELECT round trips beforehand.
      expect(mockUpdateCall).toHaveBeenCalledTimes(1);
    });
  });

  describe("deleteStatus", () => {
    it("throws NOT_FOUND when the status row doesn't exist", async () => {
      mockDeleteReturning.mockResolvedValue([]);

      await expect(deleteStatus({ statusId: "missing" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("deletes an existing status row", async () => {
      mockDeleteReturning.mockResolvedValue([{ id: "s1" }]);

      const result = await deleteStatus({ statusId: "s1" });

      expect(result.id).toBe("s1");
    });
  });
});
