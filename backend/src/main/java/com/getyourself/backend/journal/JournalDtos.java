package com.getyourself.backend.journal;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public class JournalDtos {

    public record CreateJournalRequest(
            LocalDate entryDate,
            @NotBlank @Size(max = 200) String title,
            @NotBlank @Size(max = 10000) String content,
            String mood,
            List<Long> linkedTagIds
    ) {}

    public record UpdateJournalRequest(
            LocalDate entryDate,
            @Size(max = 200) String title,
            @Size(max = 10000) String content,
            String mood,
            List<Long> linkedTagIds
    ) {}

    public record JournalResponse(
            Long id,
            LocalDate entryDate,
            String title,
            String content,
            String mood,
            List<Long> linkedTagIds,
            Instant createdAt,
            Instant updatedAt
    ) {
        public static JournalResponse from(JournalEntryEntity entity) {
            List<Long> tagIds = parseLinkedTagIds(entity.getLinkedTagIds());
            return new JournalResponse(
                    entity.getId(),
                    entity.getEntryDate(),
                    entity.getTitle(),
                    entity.getContent(),
                    entity.getMood() != null ? entity.getMood().name() : null,
                    tagIds,
                    entity.getCreatedAt(),
                    entity.getUpdatedAt()
            );
        }

        private static List<Long> parseLinkedTagIds(String json) {
            if (json == null || json.isBlank() || "null".equals(json)) {
                return List.of();
            }
            try {
                String cleaned = json.trim();
                if (cleaned.startsWith("[")) {
                    cleaned = cleaned.substring(1);
                }
                if (cleaned.endsWith("]")) {
                    cleaned = cleaned.substring(0, cleaned.length() - 1);
                }
                if (cleaned.isBlank()) {
                    return List.of();
                }
                return java.util.Arrays.stream(cleaned.split(","))
                        .map(String::trim)
                        .filter(s -> !s.isEmpty())
                        .map(Long::parseLong)
                        .toList();
            } catch (Exception e) {
                return List.of();
            }
        }
    }
}
