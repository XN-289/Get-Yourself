package com.getyourself.backend.growth;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public class GrowthTimelineDtos {

    public record TimelineItem(
            String id,
            String type,
            Instant occurredAt,
            String title,
            String summary,
            Map<String, Object> metadata
    ) {}

    public record GrowthSummary(
            long totalExperiences,
            long daysSinceFirst,
            long activeDirections,
            long journalCount,
            List<String> topTags
    ) {}
}
