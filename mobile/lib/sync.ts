import { apiClient } from './api';
import { 
  getSyncQueue, 
  removeFromSyncQueue, 
  updateSyncQueueItem, 
  type SyncQueueItem 
} from './storage';
import { isOnline } from './network';

const MAX_RETRIES = 5;
const RETRY_DELAYS = [60000, 120000, 240000, 480000]; // 1min, 2min, 4min, 8min in milliseconds

/**
 * Calculate delay for exponential backoff
 */
function getRetryDelay(retryCount: number): number {
  if (retryCount >= RETRY_DELAYS.length) {
    return RETRY_DELAYS[RETRY_DELAYS.length - 1]; // Max delay
  }
  return RETRY_DELAYS[retryCount];
}

/**
 * Check if item should be retried based on retry count and last attempt
 */
function shouldRetry(item: SyncQueueItem): boolean {
  if (item.retryCount >= MAX_RETRIES) {
    return false;
  }
  
  if (!item.lastAttempt) {
    return true; // Never attempted, can retry immediately
  }
  
  const delay = getRetryDelay(item.retryCount);
  const timeSinceLastAttempt = Date.now() - item.lastAttempt;
  
  return timeSinceLastAttempt >= delay;
}

/**
 * Sync a single report from the queue
 */
export async function syncSingleReport(item: SyncQueueItem): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if online
    if (!(await isOnline())) {
      return { success: false, error: 'Offline' };
    }

    // Check if should retry
    if (!shouldRetry(item)) {
      return { success: false, error: 'Max retries exceeded' };
    }

    // Create the report
    const report = await apiClient.createReport(item.reportData);
    
    // Upload photos if any
    if (item.photos && item.photos.length > 0) {
      for (const photoUri of item.photos) {
        try {
          await apiClient.uploadPhoto(report.id, photoUri);
        } catch (photoError: any) {
          console.warn('Failed to upload photo:', photoError);
          // Continue with other photos even if one fails
        }
      }
    }

    // Remove from queue on success
    await removeFromSyncQueue(item.id);
    
    return { success: true };
  } catch (error: any) {
    // Determine if this is a network error (should retry) or validation error (shouldn't retry)
    const isNetworkError = 
      error.code === 'ECONNABORTED' || 
      error.code === 'ECONNREFUSED' ||
      error.message?.includes('Network Error') ||
      error.message?.includes('timeout') ||
      !error.response; // No response usually means network issue

    if (isNetworkError) {
      // Network error - update retry count and last attempt
      const newRetryCount = item.retryCount + 1;
      await updateSyncQueueItem(item.id, {
        retryCount: newRetryCount,
        lastAttempt: Date.now(),
        error: error.message || 'Network error',
      });
      return { success: false, error: 'Network error - will retry' };
    } else {
      // Validation or other error - don't retry, remove from queue
      console.error('Validation error in sync - removing from queue:', error);
      await removeFromSyncQueue(item.id);
      return { success: false, error: error.message || 'Validation error' };
    }
  }
}

/**
 * Sync all pending reports in the queue
 */
export async function syncPendingReports(): Promise<{
  synced: number;
  failed: number;
  skipped: number;
}> {
  const queue = await getSyncQueue();
  let synced = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of queue) {
    if (!shouldRetry(item)) {
      skipped++;
      continue;
    }

    const result = await syncSingleReport(item);
    if (result.success) {
      synced++;
    } else {
      failed++;
    }
  }

  return { synced, failed, skipped };
}

/**
 * Retry failed submissions that haven't exceeded max retries
 */
export async function retryFailedSubmissions(): Promise<{
  synced: number;
  failed: number;
  skipped: number;
}> {
  return syncPendingReports();
}

