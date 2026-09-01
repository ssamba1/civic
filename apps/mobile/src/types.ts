export type Coordinates = { lat: number; lng: number };

export type QueueStatus = "pending" | "failed";

export interface QueuedReport {
  id: string;
  ownerId: string;
  occurredAt: string;
  publicPhotoUri: string;
  rawPhotoUri: string;
  location: Coordinates;
  address: string | null;
  description: string | null;
  issueType: string | null;
  tags: string[];
  attempts: number;
  lastError: string | null;
  status: QueueStatus;
}

export interface ReportSummary {
  id: string;
  status: string;
  address: string | null;
  description: string | null;
  photo_public_url: string | null;
  created_at: string;
  location?: Coordinates;
  category?: string;
  severity?: number;
}

export interface SyncPayload {
  id: string;
  occurredAt: string;
  photosBlurred: string[];
  photosOriginal: string[];
  phashes: string[];
  location: Coordinates;
  address: string | null;
  description: string | null;
  tags: string[];
  issueType: string | null;
}

export interface AssignedWork {
  id: string;
  crewName: string;
  status: string;
  category: string;
  address: string | null;
  dispatchedAt: string | null;
  priorityScore: number | null;
}
