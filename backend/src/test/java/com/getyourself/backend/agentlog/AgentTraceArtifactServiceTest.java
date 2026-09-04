package com.getyourself.backend.agentlog;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class AgentTraceArtifactServiceTest {
    @Mock
    private AgentTraceArtifactRepository repository;

    private AgentTraceArtifactService service;

    @BeforeEach
    void setUp() {
        service = new AgentTraceArtifactService(repository, new ObjectMapper());
    }

    @Test
    void recordRetainsOnlySanitizedSummaryAndMetadata() {
        Map<String, Object> rawContent = Map.of(
                "resumeText", "姓名：张三；手机号：13800138000",
                "authorization", "Bearer raw-secret-token"
        );

        service.record(
                7L,
                AgentStepName.RESPONSE_BUILD,
                "FINAL_RESPONSE",
                rawContent,
                "token=raw-secret-token, email=student@example.com, phone=13800138000"
        );

        ArgumentCaptor<AgentTraceArtifactEntity> captor =
                ArgumentCaptor.forClass(AgentTraceArtifactEntity.class);
        verify(repository).save(captor.capture());
        AgentTraceArtifactEntity entity = captor.getValue();

        assertThat(entity.isRedacted()).isTrue();
        assertThat(entity.getContentSummary())
                .doesNotContain("raw-secret-token")
                .doesNotContain("student@example.com")
                .doesNotContain("13800138000");
        assertThat(entity.getContentJson())
                .contains("\"mode\":\"summary-only\"")
                .contains("\"rawContentRetained\":false")
                .doesNotContain("姓名：张三")
                .doesNotContain("raw-secret-token")
                .doesNotContain("student@example.com")
                .doesNotContain("13800138000");
        assertThat(entity.getContentHash()).hasSize(64).isNotBlank();
    }

    @Test
    void artifactTypeCannotCarryUnstructuredPrivateText() {
        service.record(
                9L,
                AgentStepName.RESPONSE_BUILD,
                "token=raw-secret-token",
                Map.of("unused", true),
                "safe summary"
        );

        ArgumentCaptor<AgentTraceArtifactEntity> captor =
                ArgumentCaptor.forClass(AgentTraceArtifactEntity.class);
        verify(repository).save(captor.capture());
        AgentTraceArtifactEntity entity = captor.getValue();

        assertThat(entity.getArtifactType()).isEqualTo("UNSAFE_ARTIFACT_TYPE");
        assertThat(entity.getContentJson()).doesNotContain("raw-secret-token");
    }

    @Test
    void nullContentStillProducesARedactedMetadataArtifact() {
        service.record(8L, AgentStepName.RESPONSE_BUILD, "FINAL_RESPONSE", null, "mode=rule");

        ArgumentCaptor<AgentTraceArtifactEntity> captor =
                ArgumentCaptor.forClass(AgentTraceArtifactEntity.class);
        verify(repository).save(captor.capture());
        AgentTraceArtifactEntity entity = captor.getValue();

        assertThat(entity.getContentJson()).contains("\"summary\":\"mode=rule\"");
        assertThat(entity.isRedacted()).isTrue();
    }
}
