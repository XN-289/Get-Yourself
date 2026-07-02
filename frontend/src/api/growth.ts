import { api } from "./client";
import type {
  TimelineItem,
  GrowthSummary,
  JournalEntry,
  CreateJournalRequest,
  UpdateJournalRequest
} from "@/types/growth";

interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export const growthApi = {
  getTimeline(limit = 50) {
    return api.get<TimelineItem[]>(`/api/growth/timeline?limit=${limit}`);
  },

  getSummary() {
    return api.get<GrowthSummary>("/api/growth/summary");
  }
};

export const journalApi = {
  create(request: CreateJournalRequest) {
    return api.post<JournalEntry>("/api/journal", request);
  },

  getPage(page = 0, size = 10) {
    return api.get<PageResponse<JournalEntry>>(`/api/journal/page?page=${page}&size=${size}`);
  },

  getByRange(start: string, end: string) {
    return api.get<JournalEntry[]>(`/api/journal/range?start=${start}&end=${end}`);
  },

  update(entryId: number, request: UpdateJournalRequest) {
    return api.put<JournalEntry>(`/api/journal/${entryId}`, request);
  },

  delete(entryId: number) {
    return api.delete<void>(`/api/journal/${entryId}`);
  }
};
