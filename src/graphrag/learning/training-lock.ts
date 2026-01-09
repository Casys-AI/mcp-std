/**
 * Training Lock - Prevents concurrent SHGAT training
 *
 * Coordinates between different training sources:
 * - BATCH: Batch training from algorithm initializer
 * - PER: Per-Execution Reinforcement training
 *
 * @module graphrag/training/training-lock
 */

/**
 * Shared training lock to prevent concurrent SHGAT training
 */
export const trainingLock = {
  inProgress: false,
  owner: "" as string,

  acquire(owner: string): boolean {
    if (this.inProgress) return false;
    this.inProgress = true;
    this.owner = owner;
    return true;
  },

  release(owner: string): void {
    if (this.owner === owner) {
      this.inProgress = false;
      this.owner = "";
    }
  },

  isLocked(): boolean {
    return this.inProgress;
  },
};
