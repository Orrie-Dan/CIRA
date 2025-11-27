import AsyncStorage from '@react-native-async-storage/async-storage';

const DRAFT_REPORTS_KEY = 'draft_reports';
const SYNC_QUEUE_KEY = 'sync_queue';

export interface DraftReport {
  id: string;
  title: string;
  description: string;
  type: string;
  severity: string;
  latitude: number;
  longitude: number;
  photos: string[]; // local file URIs
  createdAt: number;
  synced: boolean;
}

export async function saveDraftReport(draft: DraftReport): Promise<void> {
  try {
    const drafts = await getDraftReports();
    const existingIndex = drafts.findIndex((d) => d.id === draft.id);
    if (existingIndex >= 0) {
      drafts[existingIndex] = draft;
    } else {
      drafts.push(draft);
    }
    await AsyncStorage.setItem(DRAFT_REPORTS_KEY, JSON.stringify(drafts));
  } catch (error) {
    console.error('Failed to save draft report:', error);
    throw error;
  }
}

export async function getDraftReports(): Promise<DraftReport[]> {
  try {
    const data = await AsyncStorage.getItem(DRAFT_REPORTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to get draft reports:', error);
    return [];
  }
}

export async function deleteDraftReport(id: string): Promise<void> {
  try {
    const drafts = await getDraftReports();
    const filtered = drafts.filter((d) => d.id !== id);
    await AsyncStorage.setItem(DRAFT_REPORTS_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to delete draft report:', error);
    throw error;
  }
}

export async function clearDraftReports(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DRAFT_REPORTS_KEY);
  } catch (error) {
    console.error('Failed to clear draft reports:', error);
  }
}

// Sync Queue for offline submissions
export interface SyncQueueItem {
  id: string;
  reportData: {
    title: string;
    description: string;
    type: string;
    severity: 'low' | 'medium' | 'high';
    latitude: number;
    longitude: number;
    addressText?: string;
    province?: string;
    district?: string;
    sector?: string;
  };
  photos: string[]; // local file URIs
  retryCount: number;
  createdAt: number;
  lastAttempt?: number;
  error?: string;
}

export async function addToSyncQueue(reportData: SyncQueueItem['reportData'], photos: string[]): Promise<string> {
  try {
    const queue = await getSyncQueue();
    const id = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const item: SyncQueueItem = {
      id,
      reportData,
      photos,
      retryCount: 0,
      createdAt: Date.now(),
    };
    queue.push(item);
    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    return id;
  } catch (error) {
    console.error('Failed to add to sync queue:', error);
    throw error;
  }
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  try {
    const data = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to get sync queue:', error);
    return [];
  }
}

export async function removeFromSyncQueue(id: string): Promise<void> {
  try {
    const queue = await getSyncQueue();
    const filtered = queue.filter((item) => item.id !== id);
    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to remove from sync queue:', error);
    throw error;
  }
}

export async function updateSyncQueueItem(id: string, updates: Partial<SyncQueueItem>): Promise<void> {
  try {
    const queue = await getSyncQueue();
    const index = queue.findIndex((item) => item.id === id);
    if (index >= 0) {
      queue[index] = { ...queue[index], ...updates };
      await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    }
  } catch (error) {
    console.error('Failed to update sync queue item:', error);
    throw error;
  }
}

export async function clearSyncQueue(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SYNC_QUEUE_KEY);
  } catch (error) {
    console.error('Failed to clear sync queue:', error);
  }
}



