package com.getyourself.backend.abilityscore;

import com.getyourself.backend.achievement.AchievementSourceType;
import com.getyourself.backend.achievement.GrowthTagEvidenceEntity;
import com.getyourself.backend.achievement.GrowthTagEvidenceRepository;
import com.getyourself.backend.common.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
public class EvidencePackageExportService {
    private static final String SCHEMA = "get-yourself.evidence-package";
    private static final int SCHEMA_VERSION = 1;
    private static final int MAX_ABILITIES = 50;
    private static final int MAX_EVIDENCE = 200;
    private static final int MAX_EVIDENCE_REFS_PER_ABILITY = 20;
    private static final int MAX_ABILITY_REFS_PER_EVIDENCE = 10;

    private final UserAbilityStateRepository stateRepository;
    private final AbilityScoreResultRepository resultRepository;
    private final GrowthTagEvidenceRepository evidenceRepository;

    public EvidencePackageExportService(UserAbilityStateRepository stateRepository,
                                        AbilityScoreResultRepository resultRepository,
                                        GrowthTagEvidenceRepository evidenceRepository) {
        this.stateRepository = stateRepository;
        this.resultRepository = resultRepository;
        this.evidenceRepository = evidenceRepository;
    }

    @Transactional(readOnly = true)
    public EvidencePackageExportDtos.EvidencePackageResponse export(String userId,
                                                                    int graduationYear,
                                                                    List<String> targetRoles) {
        List<String> roles = normalizeRoles(targetRoles);
        List<UserAbilityStateEntity> states = stateRepository
                .findByUserIdOrderByAbilityScoreDesc(userId)
                .stream()
                .sorted(Comparator
                        .comparing(UserAbilityStateEntity::getAbilityScore, Comparator.reverseOrder())
                        .thenComparing(UserAbilityStateEntity::getNormalizedDimension)
                        .thenComparing(UserAbilityStateEntity::getId))
                .limit(MAX_ABILITIES)
                .toList();

        Map<Long, LinkedHashSet<Long>> stateRecordIds = new LinkedHashMap<>();
        Map<Long, AbilityScoreResultStatus> recordStatuses = new LinkedHashMap<>();
        Map<String, Long> traceResultIds = new LinkedHashMap<>();
        for (UserAbilityStateEntity state : states) {
            LinkedHashSet<Long> recordIds = new LinkedHashSet<>();
            for (AbilityScoreResultEntity result : resultRepository
                    .findByAbilityStateIdOrderByCreatedAtDesc(state.getId())) {
                if (result.getStatus() == AbilityScoreResultStatus.SUPERSEDED
                        || result.getAchievementRecordId() == null) {
                    continue;
                }
                recordIds.add(result.getAchievementRecordId());
                recordStatuses.merge(
                        result.getAchievementRecordId(),
                        result.getStatus(),
                        EvidencePackageExportService::strongerStatus
                );
                traceResultIds.putIfAbsent(
                        traceKey(result.getAchievementRecordId(), state.getId()),
                        result.getId()
                );
            }
            if (!recordIds.isEmpty()) {
                stateRecordIds.put(state.getId(), recordIds);
            }
        }

        List<Long> allRecordIds = stateRecordIds.values().stream()
                .flatMap(LinkedHashSet::stream)
                .distinct()
                .toList();
        List<GrowthTagEvidenceEntity> selectedEvidence = allRecordIds.isEmpty()
                ? List.of()
                : evidenceRepository.findByRecord_IdInAndUserIdOrderByOccurredAtAsc(allRecordIds, userId).stream()
                .sorted(Comparator.comparing(GrowthTagEvidenceEntity::getOccurredAt, Comparator.reverseOrder())
                        .thenComparing(GrowthTagEvidenceEntity::getId, Comparator.reverseOrder()))
                .limit(MAX_EVIDENCE)
                .toList();

        Map<Long, LinkedHashSet<UserAbilityStateEntity>> evidenceStates = new LinkedHashMap<>();
        for (GrowthTagEvidenceEntity evidence : selectedEvidence) {
            Long recordId = evidence.getRecord() == null ? null : evidence.getRecord().getId();
            if (recordId == null) {
                continue;
            }
            LinkedHashSet<UserAbilityStateEntity> linkedStates = evidenceStates.computeIfAbsent(
                    evidence.getId(),
                    ignored -> new LinkedHashSet<>()
            );
            for (UserAbilityStateEntity state : states) {
                if (stateRecordIds.getOrDefault(state.getId(), new LinkedHashSet<>()).contains(recordId)) {
                    linkedStates.add(state);
                }
            }
        }

        Map<Long, String> abilityIds = new LinkedHashMap<>();
        for (UserAbilityStateEntity state : states) {
            boolean hasEvidence = evidenceStates.values().stream()
                    .anyMatch(linked -> linked.contains(state));
            if (hasEvidence) {
                abilityIds.put(state.getId(), safeId("ability", state.getNormalizedDimension()));
            }
        }
        if (abilityIds.isEmpty()) {
            throw ApiException.badRequest("当前账号还没有可导出的能力证据");
        }

        List<EvidencePackageExportDtos.Evidence> evidence = selectedEvidence.stream()
                .filter(item -> evidenceStates.containsKey(item.getId()))
                .map(item -> evidence(item, evidenceStates.get(item.getId()), abilityIds, recordStatuses, traceResultIds))
                .toList();

        List<EvidencePackageExportDtos.Ability> abilities = new ArrayList<>();
        for (UserAbilityStateEntity state : states) {
            String abilityId = abilityIds.get(state.getId());
            if (abilityId == null) {
                continue;
            }
            List<String> refs = evidence.stream()
                    .filter(item -> item.abilityIds().contains(abilityId))
                    .map(EvidencePackageExportDtos.Evidence::id)
                    .limit(MAX_EVIDENCE_REFS_PER_ABILITY)
                    .toList();
            if (refs.isEmpty()) {
                continue;
            }
            double score = score(state.getAbilityScore());
            abilities.add(new EvidencePackageExportDtos.Ability(
                    abilityId,
                    compact(state.getDimensionName(), 40),
                    score,
                    compact("平台能力评分 %s 分，包含 %d 条可解释证据。".formatted(
                            BigDecimal.valueOf(score).stripTrailingZeros().toPlainString(),
                            refs.size()
                    ), 160),
                    refs
            ));
        }

        List<String> retainedAbilityIds = abilities.stream().map(EvidencePackageExportDtos.Ability::id).toList();
        evidence = evidence.stream()
                .map(item -> new EvidencePackageExportDtos.Evidence(
                        item.id(),
                        item.title(),
                        item.summary(),
                        item.occurredAt(),
                        item.sourceType(),
                        item.sourceId(),
                        item.verification(),
                        item.abilityIds().stream().filter(retainedAbilityIds::contains).toList(),
                        item.traceId()
                ))
                .filter(item -> !item.abilityIds().isEmpty())
                .toList();
        List<String> strengths = abilities.stream()
                .limit(5)
                .map(ability -> compact(ability.name() + "有可解释证据", 80))
                .toList();
        List<String> gapFocus = abilities.stream()
                .skip(Math.max(0, abilities.size() - 3))
                .map(ability -> compact("补充%s的量化结果", 80).formatted(ability.name()))
                .toList();
        EvidencePackageExportDtos.MemorySummary memorySummary = new EvidencePackageExportDtos.MemorySummary(
                compact("按目标方向导出 %d 项能力和 %d 条平台证据。".formatted(abilities.size(), evidence.size()), 240),
                strengths,
                gapFocus
        );
        String packageId = packageId(graduationYear, roles, abilities, evidence, memorySummary);

        return new EvidencePackageExportDtos.EvidencePackageResponse(
                SCHEMA,
                SCHEMA_VERSION,
                packageId,
                Instant.now(),
                new EvidencePackageExportDtos.Student(graduationYear, roles),
                abilities,
                evidence,
                memorySummary
        );
    }

    private EvidencePackageExportDtos.Evidence evidence(GrowthTagEvidenceEntity item,
                                                        LinkedHashSet<UserAbilityStateEntity> linkedStates,
                                                        Map<Long, String> abilityIds,
                                                        Map<Long, AbilityScoreResultStatus> recordStatuses,
                                                        Map<String, Long> traceResultIds) {
        UserAbilityStateEntity firstState = linkedStates.getFirst();
        Long recordId = item.getRecord().getId();
        Long resultId = traceResultIds.getOrDefault(traceKey(recordId, firstState.getId()), 0L);
        return new EvidencePackageExportDtos.Evidence(
                safeId("evidence", String.valueOf(item.getId())),
                compact(firstPresent(item.getTitle(), "平台成长证据"), 80),
                compact(firstPresent(
                        item.getSummary(),
                        item.getDid(),
                        item.getLearned(),
                        "平台成长证据摘要"
                ), 240),
                item.getOccurredAt(),
                sourceType(item.getSourceType()),
                "record-" + recordId,
                verification(recordStatuses.get(recordId)),
                linkedStates.stream()
                        .map(state -> abilityIds.get(state.getId()))
                        .filter(Objects::nonNull)
                        .limit(MAX_ABILITY_REFS_PER_EVIDENCE)
                        .toList(),
                "trace.ability-score-" + resultId
        );
    }

    private static List<String> normalizeRoles(List<String> targetRoles) {
        if (targetRoles == null || targetRoles.isEmpty() || targetRoles.size() > 10) {
            throw ApiException.badRequest("目标岗位方向必须为 1 到 10 个");
        }
        LinkedHashSet<String> roles = new LinkedHashSet<>();
        for (String role : targetRoles) {
            String value = role == null ? "" : role.replaceAll("[\\x00-\\x1F\\x7F]", " ").trim();
            if (value.isBlank()) {
                throw ApiException.badRequest("目标岗位方向不能为空");
            }
            if (value.length() > 40) {
                throw ApiException.badRequest("目标岗位方向不能超过 40 个字符");
            }
            roles.add(value);
        }
        if (roles.isEmpty()) {
            throw ApiException.badRequest("目标岗位方向不能为空");
        }
        return List.copyOf(roles);
    }

    private static AbilityScoreResultStatus strongerStatus(AbilityScoreResultStatus left,
                                                           AbilityScoreResultStatus right) {
        return statusRank(left) >= statusRank(right) ? left : right;
    }

    private static int statusRank(AbilityScoreResultStatus status) {
        if (status == AbilityScoreResultStatus.VERIFIED) {
            return 3;
        }
        if (status == AbilityScoreResultStatus.REVIEW_REQUIRED) {
            return 2;
        }
        return status == AbilityScoreResultStatus.PROVISIONAL ? 1 : 0;
    }

    private static String verification(AbilityScoreResultStatus status) {
        if (status == AbilityScoreResultStatus.VERIFIED) {
            return "verified";
        }
        if (status == AbilityScoreResultStatus.REVIEW_REQUIRED) {
            return "platform_reviewed";
        }
        if (status == AbilityScoreResultStatus.PROVISIONAL) {
            return "user_confirmed";
        }
        return "unverified";
    }

    private static String sourceType(AchievementSourceType sourceType) {
        if (sourceType == AchievementSourceType.EVENT) {
            return "growth_record";
        }
        if (sourceType == AchievementSourceType.CHALLENGE) {
            return "challenge";
        }
        return "manual";
    }

    private static double score(BigDecimal value) {
        BigDecimal score = value == null ? BigDecimal.ZERO : value;
        return score.max(BigDecimal.ZERO)
                .min(BigDecimal.valueOf(100))
                .setScale(1, RoundingMode.HALF_UP)
                .doubleValue();
    }

    private static String safeId(String prefix, String value) {
        return prefix + "-" + sha256(String.valueOf(value)).substring(0, 16);
    }

    private static String packageId(int graduationYear,
                                    List<String> roles,
                                    List<EvidencePackageExportDtos.Ability> abilities,
                                    List<EvidencePackageExportDtos.Evidence> evidence,
                                    EvidencePackageExportDtos.MemorySummary memorySummary) {
        StringBuilder semantic = new StringBuilder()
                .append(SCHEMA).append('|')
                .append(SCHEMA_VERSION).append('|')
                .append(graduationYear).append('|')
                .append(String.join(",", roles)).append('|');
        for (EvidencePackageExportDtos.Ability ability : abilities) {
            appendPart(semantic, ability.id());
            appendPart(semantic, ability.name());
            appendPart(semantic, Double.toString(ability.score()));
            appendPart(semantic, ability.summary());
            appendPart(semantic, String.join(",", ability.evidenceRefs()));
        }
        for (EvidencePackageExportDtos.Evidence item : evidence) {
            appendPart(semantic, item.id());
            appendPart(semantic, item.title());
            appendPart(semantic, item.summary());
            appendPart(semantic, item.occurredAt().toString());
            appendPart(semantic, item.sourceType());
            appendPart(semantic, item.sourceId());
            appendPart(semantic, item.verification());
            appendPart(semantic, String.join(",", item.abilityIds()));
            appendPart(semantic, item.traceId());
        }
        appendPart(semantic, memorySummary.summary());
        appendPart(semantic, String.join(",", memorySummary.strengths()));
        appendPart(semantic, String.join(",", memorySummary.gapFocus()));
        return "gy-" + sha256(semantic.toString()).substring(0, 40);
    }

    private static void appendPart(StringBuilder builder, String value) {
        String text = String.valueOf(value);
        builder.append(text.length()).append(':').append(text).append('|');
    }

    private static String traceKey(Long recordId, Long stateId) {
        return recordId + ":" + stateId;
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is not available", ex);
        }
    }

    private static String firstPresent(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return "";
    }

    private static String compact(String value, int maxLength) {
        String text = value == null ? "" : value.replaceAll("[\\x00-\\x1F\\x7F]", " ").trim();
        return text.length() <= maxLength ? text : text.substring(0, maxLength);
    }
}
