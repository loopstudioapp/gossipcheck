export type SourceName = 'Tea' | 'Public web';
export type SourceStatus = 'queued' | 'running' | 'complete' | 'unconfigured' | 'failed';

export type EvidenceRecord = {
  id: string;
  source: SourceName;
  title: string;
  excerpt: string;
  sourceUrl: string | null;
  confidence: number;
  reasons: string[];
  capturedAt: string;
  hasImage: boolean;
  imageUrl: string | null;
  dismissed: boolean;
};

export type SourceRunRecord = {
  id: string;
  name: SourceName;
  status: SourceStatus;
  note: string;
  matches: number;
};

export type ScanRecord = {
  id: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  createdAt: string;
  completedAt: string | null;
  error: string | null;
  profile: {
    firstName: string;
    age: number;
    city: string;
    usernames: string[];
    photoUrl: string | null;
  };
  sources: SourceRunRecord[];
  evidence: EvidenceRecord[];
};

export type CreateScanRequest = {
  firstName: string;
  age: number;
  city: string;
  usernames: string[];
  selfSearchConfirmed: boolean;
};
