package com.getyourself.backend.abilityscore;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.getyourself.backend.achievement.AchievementRecordEntity;
import com.getyourself.backend.achievement.AchievementSourceType;
import com.getyourself.backend.achievement.GrowthTagEvidenceEntity;
import com.getyourself.backend.achievement.GrowthTagEvidenceRepository;
import com.getyourself.backend.common.ApiException;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class EvidencePackageExportServiceTest {
    private final UserAbilityStateRepository stateRepository = mock(UserAbilityStateRepository.class);
    private final AbilityScoreResultRepository resultRepository = mock(AbilityScoreResultRepository.class);
    private final GrowthTagEvidenceRepository evidenceRepository = mock(GrowthTagEvidenceRepository.class);
    private final EvidencePackageExportService service = new EvidencePackageExportService(
            stateRepository,
            resultRepository,
            evidenceRepository
    );

    @Test
    void exportsContractPackageWithReferencesAndDeterministicPackageId() throws Exception {
        UserAbilityStateEntity state = state(42L, "后端开发", "backend", "120.4");
        when(stateRepository.findByUserIdOrderByAbilityScoreDesc("user-1")).thenReturn(List.of(state));
        AbilityScoreResultEntity result = result(18L, 42L, AbilityScoreResultStatus.VERIFIED);
        when(resultRepository.findByAbilityStateIdOrderByCreatedAtDesc(42L)).thenReturn(List.of(result));
        GrowthTagEvidenceEntity evidence = evidence(91L, 18L);
        when(evidenceRepository.findByRecord_IdInAndUserIdOrderByOccurredAtAsc(anyCollection(), eq("user-1")))
                .thenReturn(List.of(evidence));

        EvidencePackageExportDtos.EvidencePackageResponse first = service.export(
                "user-1",
                2027,
                List.of("Java 后端开发")
        );
        EvidencePackageExportDtos.EvidencePackageResponse second = service.export(
                "user-1",
                2027,
                List.of("Java 后端开发")
        );

        assertThat(first.schema()).isEqualTo("get-yourself.evidence-package");
        assertThat(first.schemaVersion()).isEqualTo(1);
        assertThat(first.packageId()).isEqualTo(second.packageId());
        assertThat(first.student().graduationYear()).isEqualTo(2027);
        assertThat(first.student().targetRoles()).containsExactly("Java 后端开发");
        assertThat(first.abilities()).hasSize(1);
        assertThat(first.abilities().getFirst().score()).isEqualTo(100.0);
        assertThat(first.abilities().getFirst().evidenceRefs())
                .containsExactly(first.evidence().getFirst().id());
        assertThat(first.evidence()).hasSize(1);
        assertThat(first.evidence().getFirst().sourceType()).isEqualTo("growth_record");
        assertThat(first.evidence().getFirst().sourceId()).isEqualTo("record-18");
        assertThat(first.evidence().getFirst().verification()).isEqualTo("verified");
        assertThat(first.evidence().getFirst().traceId()).isEqualTo("trace.ability-score-18");
        assertThat(first.evidence().getFirst().abilityIds())
                .containsExactly(first.abilities().getFirst().id());
        assertThat(first.memorySummary().summary()).isNotBlank();
    }

    @Test
    void keepsOnlyContractFieldsAndPlatformData() throws Exception {
        UserAbilityStateEntity state = state(42L, "工程协作", "collaboration", "71.45");
        when(stateRepository.findByUserIdOrderByAbilityScoreDesc("user-1")).thenReturn(List.of(state));
        when(resultRepository.findByAbilityStateIdOrderByCreatedAtDesc(42L))
                .thenReturn(List.of(result(18L, 42L, AbilityScoreResultStatus.PROVISIONAL)));
        GrowthTagEvidenceEntity evidence = evidence(91L, 18L);
        when(evidenceRepository.findByRecord_IdInAndUserIdOrderByOccurredAtAsc(anyCollection(), eq("user-1")))
                .thenReturn(List.of(evidence));

        EvidencePackageExportDtos.EvidencePackageResponse response = service.export(
                "user-1",
                2027,
                List.of("Java 后端开发")
        );

        ObjectMapper mapper = new ObjectMapper().registerModule(new JavaTimeModule());
        Map<?, ?> json = mapper.convertValue(response, Map.class);
        assertThat(json.keySet().stream().map(String::valueOf)).containsExactlyInAnyOrder(
                "schema",
                "schemaVersion",
                "packageId",
                "generatedAt",
                "student",
                "abilities",
                "evidence",
                "memorySummary"
        );
        Map<?, ?> student = (Map<?, ?>) json.get("student");
        assertThat(student.keySet().stream().map(String::valueOf))
                .containsExactlyInAnyOrder("graduationYear", "targetRoles");
        String serialized = mapper.writeValueAsString(response);
        assertThat(serialized)
                .doesNotContain("phone")
                .doesNotContain("email")
                .doesNotContain("token")
                .doesNotContain("user-1")
                .doesNotContain("resumeText");
    }

    @Test
    void rejectsExportWhenThereIsNoLinkedEvidence() {
        when(stateRepository.findByUserIdOrderByAbilityScoreDesc("user-1")).thenReturn(List.of());

        assertThatThrownBy(() -> service.export("user-1", 2027, List.of("Java 后端开发")))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("还没有可导出的能力证据");
    }

    @Test
    void limitsAndDeduplicatesTargetRoles() {
        assertThatThrownBy(() -> service.export("user-1", 2027, List.of(" ")))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("目标岗位方向不能为空");
    }

    private UserAbilityStateEntity state(Long id, String name, String normalized, String score) throws Exception {
        UserAbilityStateEntity state = new UserAbilityStateEntity();
        setId(state, id);
        state.setUserId("user-1");
        state.setDimensionName(name);
        state.setNormalizedDimension(normalized);
        state.setAbilityScore(new BigDecimal(score));
        return state;
    }

    private AbilityScoreResultEntity result(Long recordId, Long stateId, AbilityScoreResultStatus status)
            throws Exception {
        AbilityScoreResultEntity result = new AbilityScoreResultEntity();
        setId(result, 18L);
        result.setAchievementRecordId(recordId);
        result.setAbilityStateId(stateId);
        result.setStatus(status);
        return result;
    }

    private GrowthTagEvidenceEntity evidence(Long id, Long recordId) {
        GrowthTagEvidenceEntity evidence = mock(GrowthTagEvidenceEntity.class);
        AchievementRecordEntity record = mock(AchievementRecordEntity.class);
        when(evidence.getId()).thenReturn(id);
        when(evidence.getRecord()).thenReturn(record);
        when(record.getId()).thenReturn(recordId);
        when(evidence.getTitle()).thenReturn("宿舍报修小程序");
        when(evidence.getSummary()).thenReturn("完成后端接口开发并进入宿舍试用");
        when(evidence.getSourceType()).thenReturn(AchievementSourceType.EVENT);
        when(evidence.getOccurredAt()).thenReturn(Instant.parse("2026-05-01T00:00:00.000Z"));
        return evidence;
    }

    private void setId(UserAbilityStateEntity state, Long id) throws Exception {
        var field = UserAbilityStateEntity.class.getDeclaredField("id");
        field.setAccessible(true);
        field.set(state, id);
    }

    private void setId(AbilityScoreResultEntity result, Long id) throws Exception {
        var field = AbilityScoreResultEntity.class.getDeclaredField("id");
        field.setAccessible(true);
        field.set(result, id);
    }
}
