export interface TimelineItem {
  id: string;
  type: "EVENT" | "CHALLENGE" | "COACH_LOG" | "JOURNAL" | "GROWTH_TAG" | "ABILITY_SCORE";
  occurredAt: string;
  title: string;
  summary: string;
  metadata: Record<string, unknown>;
}

export interface GrowthSummary {
  totalExperiences: number;
  daysSinceFirst: number;
  activeDirections: number;
  journalCount: number;
  topTags: string[];
}

export interface JournalEntry {
  id: number;
  entryDate: string;
  title: string;
  content: string;
  mood: "GREAT" | "GOOD" | "OK" | "LOW" | "TOUGH" | null;
  linkedTagIds: number[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateJournalRequest {
  entryDate?: string;
  title: string;
  content: string;
  mood?: string;
  linkedTagIds?: number[];
}

export interface UpdateJournalRequest {
  entryDate?: string;
  title?: string;
  content?: string;
  mood?: string;
  linkedTagIds?: number[];
}
