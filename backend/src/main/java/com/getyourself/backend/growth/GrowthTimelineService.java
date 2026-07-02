package com.getyourself.backend.growth;

import com.getyourself.backend.achievement.AchievementRecordEntity;
import com.getyourself.backend.achievement.AchievementRecordRepository;
import com.getyourself.backend.achievement.GrowthTagEntity;
import com.getyourself.backend.achievement.GrowthTagRepository;
import com.getyourself.backend.coach.CoachLogRepository;
import com.getyourself.backend.journal.JournalRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Stream;

@Service
public class GrowthTimelineService {
    private final AchievementRecordRepository achievementRepository;
    private final CoachLogRepository coachLogRepository;
    private final JournalRepository journalRepository;
    private final GrowthTagRepository growthTagRepository;

    public GrowthTimelineService(AchievementRecordRepository achievementRepository,
                                 CoachLogRepository coachLogRepository,
                                 JournalRepository journalRepository,
                                 GrowthTagRepository growthTagRepository) {
        this.achievementRepository = achievementRepository;
        this.coachLogRepository = coachLogRepository;
        this.journalRepository = journalRepository;
        this.growthTagRepository = growthTagRepository;
    }

    @Transactional(readOnly = true)
    public List<GrowthTimelineDtos.TimelineItem> timeline(String userId, int limit) {
        List<GrowthTimelineDtos.TimelineItem> items = new ArrayList<>();

        // Achievement records
        achievementRepository.findByUserIdOrderByCompletedAtDesc(userId)
                .stream()
                .limit(50)
                .forEach(record -> items.add(new GrowthTimelineDtos.TimelineItem(
                        "achievement-" + record.getId(),
                        record.getSourceType() != null ? record.getSourceType().name() : "EVENT",
                        record.getCompletedAt(),
                        record.getEventTitle(),
                        truncate(record.getContent(), 100),
                        Map.of(
                                "category", record.getCategory() != null ? record.getCategory() : "",
                                "organization", record.getOrganizationName() != null ? record.getOrganizationName() : "",
                                "hasReflection", record.getDid() != null && !record.getDid().isBlank()
                        )
                )));

        // Coach logs
        coachLogRepository.findByUserIdOrderByLogDateDesc(userId)
                .stream()
                .limit(50)
                .forEach(log -> items.add(new GrowthTimelineDtos.TimelineItem(
                        "coachlog-" + log.getId(),
                        "COACH_LOG",
                        log.getCreatedAt(),
                        log.getTitle(),
                        truncate(log.getSummary(), 100),
                        Map.of("tags", log.getTags() != null ? log.getTags() : "")
                )));

        // Journal entries
        journalRepository.findByUserIdOrderByEntryDateDesc(userId)
                .stream()
                .limit(50)
                .forEach(entry -> items.add(new GrowthTimelineDtos.TimelineItem(
                        "journal-" + entry.getId(),
                        "JOURNAL",
                        entry.getCreatedAt(),
                        entry.getTitle(),
                        truncate(entry.getContent(), 100),
                        Map.of("mood", entry.getMood() != null ? entry.getMood().name() : "NONE")
                )));

        // Growth tags (as milestones)
        growthTagRepository.findByUserIdOrderByScoreDescLastUpdatedAtDesc(userId)
                .stream()
                .filter(tag -> tag.getEvidenceCount() >= 3)
                .limit(20)
                .forEach(tag -> items.add(new GrowthTimelineDtos.TimelineItem(
                        "tag-" + tag.getId(),
                        "GROWTH_TAG",
                        tag.getLastUpdatedAt(),
                        tag.getName(),
                        tag.getDescription() != null ? tag.getDescription() : "",
                        Map.of("score", tag.getScore(), "evidenceCount", tag.getEvidenceCount())
                )));

        items.sort(Comparator.comparing(GrowthTimelineDtos.TimelineItem::occurredAt).reversed());
        return items.stream().limit(Math.max(limit, 1)).toList();
    }

    @Transactional(readOnly = true)
    public GrowthTimelineDtos.GrowthSummary summary(String userId) {
        long totalExperiences = achievementRepository.countByUserId(userId);
        long journalCount = journalRepository.countByUserId(userId);

        // Days since first record
        List<AchievementRecordEntity> records = achievementRepository.findByUserIdOrderByCompletedAtDesc(userId);
        long daysSinceFirst = 0;
        if (!records.isEmpty()) {
            Instant first = records.get(records.size() - 1).getCompletedAt();
            if (first != null) {
                daysSinceFirst = ChronoUnit.DAYS.between(first, Instant.now());
            }
        }

        // Active directions (growth tags)
        List<GrowthTagEntity> tags = growthTagRepository.findByUserIdOrderByScoreDescLastUpdatedAtDesc(userId);
        long activeDirections = tags.stream().filter(t -> t.getEvidenceCount() >= 2).count();

        // Top tags
        List<String> topTags = tags.stream()
                .limit(5)
                .map(GrowthTagEntity::getName)
                .toList();

        return new GrowthTimelineDtos.GrowthSummary(
                totalExperiences, daysSinceFirst, activeDirections, journalCount, topTags
        );
    }

    private String truncate(String text, int maxLen) {
        if (text == null) return "";
        return text.length() > maxLen ? text.substring(0, maxLen) + "..." : text;
    }
}
