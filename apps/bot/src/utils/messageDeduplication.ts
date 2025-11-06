/**
 * Message deduplication utility with automatic timeout-based cleanup.
 * Prevents duplicate processing of messages while ensuring memory is freed after a timeout period.
 * Uses interval-based cleanup to prevent timer accumulation.
 */
export class MessageDeduplicator {
  private processedItems = new Map<string, number>();
  private readonly timeoutMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly cleanupIntervalMs: number = 60 * 1000; // Clean up every minute

  /**
   * Creates a new MessageDeduplicator
   * @param timeoutMs Time in milliseconds to keep items in the map before automatic cleanup (default: 5 minutes)
   */
  constructor(timeoutMs: number = 5 * 60 * 1000) {
    this.timeoutMs = timeoutMs;
    this.startCleanupInterval();
  }

  /**
   * Start the cleanup interval if not already running
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval !== null) return;

    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.cleanupIntervalMs);
  }

  /**
   * Clean up expired items from the map
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, timestamp] of this.processedItems.entries()) {
      if (now - timestamp > this.timeoutMs) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.processedItems.delete(key);
    }
  }

  /**
   * Check if an item has already been processed
   * @param id The unique identifier to check
   * @returns true if the item has been processed, false otherwise
   */
  has(id: string): boolean {
    const timestamp = this.processedItems.get(id);
    if (timestamp === undefined) return false;

    // Check if expired
    if (Date.now() - timestamp > this.timeoutMs) {
      this.processedItems.delete(id);
      return false;
    }

    return true;
  }

  /**
   * Mark an item as processed with automatic cleanup
   * @param id The unique identifier to mark as processed
   */
  add(id: string): void {
    this.processedItems.set(id, Date.now());
  }

  /**
   * Stop the cleanup interval (useful for testing or cleanup)
   */
  destroy(): void {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.processedItems.clear();
  }
}
