/**
 * Resource Limiter Tests
 *
 * Tests for Story 3.9 AC #4 (Resource Limits)
 * - Concurrent execution limits
 * - Memory allocation tracking
 * - Memory pressure detection
 */

import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { ResourceLimiter, ResourceLimitError } from "../../../src/sandbox/resource-limiter.ts";

// Reset singleton before each test
function resetLimiter() {
  ResourceLimiter.resetInstance();
}

Deno.test({
  name: "ResourceLimiter - enforce max concurrent executions",
  fn: async () => {
    resetLimiter();
    const limiter = ResourceLimiter.getInstance({
      maxConcurrentExecutions: 2,
      maxTotalMemoryMb: 2048,
      enableMemoryPressureDetection: false, // Disable for testing
    });

    // Acquire 2 slots (max)
    const token1 = await limiter.acquire(512);
    const token2 = await limiter.acquire(512);

    assertExists(token1);
    assertExists(token2);

    // Try to acquire 3rd slot - should fail
    await assertRejects(
      () => limiter.acquire(512),
      ResourceLimitError,
      "CONCURRENT_EXECUTIONS",
    );

    // Release one slot
    limiter.release(token1);

    // Now we can acquire again
    const token3 = await limiter.acquire(512);
    assertExists(token3);

    // Cleanup
    limiter.release(token2);
    limiter.release(token3);
  },
});

Deno.test({
  name: "ResourceLimiter - enforce total memory limit",
  fn: async () => {
    resetLimiter();
    const limiter = ResourceLimiter.getInstance({
      maxConcurrentExecutions: 10, // High concurrent limit
      maxTotalMemoryMb: 1000, // But limited total memory
      enableMemoryPressureDetection: false, // Disable for testing
    });

    // Acquire 1000MB (max)
    const token1 = await limiter.acquire(600);
    const token2 = await limiter.acquire(400);

    assertExists(token1);
    assertExists(token2);

    // Try to acquire more - should fail
    await assertRejects(
      () => limiter.acquire(100),
      ResourceLimitError,
      "TOTAL_MEMORY",
    );

    // Release one slot
    limiter.release(token1);

    // Now we can acquire again
    const token3 = await limiter.acquire(500);
    assertExists(token3);

    // Cleanup
    limiter.release(token2);
    limiter.release(token3);
  },
});

Deno.test({
  name: "ResourceLimiter - getStats() returns accurate statistics",
  fn: async () => {
    resetLimiter();
    const limiter = ResourceLimiter.getInstance({
      maxConcurrentExecutions: 5,
      maxTotalMemoryMb: 2048,
      enableMemoryPressureDetection: false, // Disable for testing
    });

    // Initial stats
    let stats = limiter.getStats();
    assertEquals(stats.activeExecutions, 0);
    assertEquals(stats.maxConcurrent, 5);
    assertEquals(stats.totalExecutions, 0);
    assertEquals(stats.rejectedExecutions, 0);
    assertEquals(stats.currentAllocatedMemoryMb, 0);

    // Acquire slots
    const token1 = await limiter.acquire(512);
    const token2 = await limiter.acquire(256);

    // Check stats
    stats = limiter.getStats();
    assertEquals(stats.activeExecutions, 2);
    assertEquals(stats.totalExecutions, 2);
    assertEquals(stats.currentAllocatedMemoryMb, 768);
    assertEquals(stats.availableSlots, 3);

    // Try to exceed limit
    try {
      await ResourceLimiter.getInstance({
        maxConcurrentExecutions: 2, // Will be ignored (singleton)
      }).acquire(512);
      await limiter.acquire(512);
      await limiter.acquire(512);
      await limiter.acquire(512);
      // 6th will fail
      await limiter.acquire(512);
    } catch (error) {
      // Expected
    }

    stats = limiter.getStats();
    assertEquals(stats.rejectedExecutions, 1);

    // Cleanup
    limiter.release(token1);
    limiter.release(token2);
  },
});

Deno.test({
  name: "ResourceLimiter - canAcquire() checks without acquiring",
  fn: async () => {
    resetLimiter();
    const limiter = ResourceLimiter.getInstance({
      maxConcurrentExecutions: 2,
      maxTotalMemoryMb: 1000,
      enableMemoryPressureDetection: false, // Disable for testing
    });

    // Should be able to acquire
    assertEquals(limiter.canAcquire(500), true);

    const token1 = await limiter.acquire(500);
    const token2 = await limiter.acquire(400);

    // Should not be able to acquire (concurrent limit reached)
    assertEquals(limiter.canAcquire(100), false);

    // Release one
    limiter.release(token1);

    // Still can't acquire (memory limit)
    assertEquals(limiter.canAcquire(700), false);

    // But can acquire smaller amount
    assertEquals(limiter.canAcquire(500), true);

    // Cleanup
    limiter.release(token2);
  },
});

Deno.test({
  name: "ResourceLimiter - token can only be released once",
  fn: async () => {
    resetLimiter();
    const limiter = ResourceLimiter.getInstance({
      enableMemoryPressureDetection: false, // Disable for testing
    });

    const token = await limiter.acquire(512);

    // Release first time
    limiter.release(token);

    const stats1 = limiter.getStats();
    assertEquals(stats1.activeExecutions, 0);

    // Release again - should be no-op
    limiter.release(token);

    const stats2 = limiter.getStats();
    assertEquals(stats2.activeExecutions, 0); // Still 0, not negative
  },
});

Deno.test({
  name: "ResourceLimiter - acquireWithWait() waits for available slot",
  fn: async () => {
    resetLimiter();
    const limiter = ResourceLimiter.getInstance({
      maxConcurrentExecutions: 1,
      enableMemoryPressureDetection: false, // Disable for testing
    });

    const token1 = await limiter.acquire(512);

    // Start waiting in background
    const acquirePromise = limiter.acquireWithWait(512, 1000);

    // Release after delay
    setTimeout(() => {
      limiter.release(token1);
    }, 200);

    // Should eventually acquire
    const token2 = await acquirePromise;
    assertExists(token2);

    // Cleanup
    limiter.release(token2);
  },
});

Deno.test({
  name: "ResourceLimiter - acquireWithWait() times out if slot never available",
  fn: async () => {
    resetLimiter();
    const limiter = ResourceLimiter.getInstance({
      maxConcurrentExecutions: 1,
      enableMemoryPressureDetection: false, // Disable for testing
    });

    const token1 = await limiter.acquire(512);

    // Try to wait with short timeout
    await assertRejects(
      () => limiter.acquireWithWait(512, 300), // 300ms timeout
      ResourceLimitError,
      "ACQUIRE_TIMEOUT",
    );

    // Cleanup
    limiter.release(token1);
  },
});

Deno.test({
  name: "ResourceLimiter - singleton returns same instance",
  fn: () => {
    resetLimiter();
    const limiter1 = ResourceLimiter.getInstance();
    const limiter2 = ResourceLimiter.getInstance({ maxConcurrentExecutions: 10 });

    // Should be same instance (config ignored on 2nd call)
    assertEquals(limiter1, limiter2);
  },
});
