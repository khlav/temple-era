/**
 * Message deduplication utility with automatic timeout-based cleanup.
 * Prevents duplicate processing of messages while ensuring memory is freed after a timeout period.
 */
export class MessageDeduplicator {
  private processedItems = new Set<string>();
  private readonly timeoutMs: number;

  /**
   * Creates a new MessageDeduplicator
   * @param timeoutMs Time in milliseconds to keep items in the set before automatic cleanup (default: 5 minutes)
   */
  constructor(timeoutMs: number = 5 * 60 * 1000) {
    this.timeoutMs = timeoutMs;
  }

  /**
   * Check if an item has already been processed
   * @param id The unique identifier to check
   * @returns true if the item has been processed, false otherwise
   */
  has(id: string): boolean {
    return this.processedItems.has(id);
  }

  /**
   * Mark an item as processed and schedule automatic cleanup
   * @param id The unique identifier to mark as processed
   */
  add(id: string): void {
    this.processedItems.add(id);
    setTimeout(() => this.processedItems.delete(id), this.timeoutMs);
  }
}
