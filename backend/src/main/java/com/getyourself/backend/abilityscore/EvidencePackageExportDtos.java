package com.getyourself.backend.abilityscore;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

public class EvidencePackageExportDtos {
    public record ExportRequest(
            @NotNull
            @Min(2000)
            @Max(2100)
            Integer graduationYear,
            @NotEmpty
            @Size(max = 10)
            List<@NotBlank @Size(max = 40) String> targetRoles
    ) {
    }

    public record EvidencePackageResponse(
            String schema,
            int schemaVersion,
            String packageId,
            Instant generatedAt,
            Student student,
            List<Ability> abilities,
            List<Evidence> evidence,
            MemorySummary memorySummary
    ) {
    }

    public record Student(
            int graduationYear,
            List<String> targetRoles
    ) {
    }

    public record Ability(
            String id,
            String name,
            double score,
            String summary,
            List<String> evidenceRefs
    ) {
    }

    public record Evidence(
            String id,
            String title,
            String summary,
            Instant occurredAt,
            String sourceType,
            String sourceId,
            String verification,
            List<String> abilityIds,
            String traceId
    ) {
    }

    public record MemorySummary(
            String summary,
            List<String> strengths,
            List<String> gapFocus
    ) {
    }
}
