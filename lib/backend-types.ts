export type SourceName = 'Tea' | 'Face search' | 'Public web';
export type SourceStatus = 'queued' | 'running' | 'complete' | 'unconfigured' | 'failed';
export type EvidenceKind = 'tea_post' | 'face_match' | 'profile_match' | 'web_page' | 'manual_import';

export type EvidenceComment = {
  id: string;
  author: string;
  text: string;
  postedAt: string | null;
  reactions: number;
};

export type EvidenceRecord = {
  id: string;
  source: SourceName;
  kind: EvidenceKind;
  provider: string;
  externalId: string | null;
  title: string;
  excerpt: string;
  sourceUrl: string | null;
  confidence: number;
  reasons: string[];
  capturedAt: string;
  hasImage: boolean;
  imageUrl: string | null;
  dismissed: boolean;
  subjectAge: number | null;
  subjectLocation: string | null;
  commentCount: number;
  redFlags: number;
  greenFlags: number;
  providerScore: number | null;
  comments: EvidenceComment[];
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
  faceSearchConfirmed?: boolean;
};
