package com.getyourself.backend.agentlog;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Service
public class AgentTraceArtifactService {
    private static final Logger log = LoggerFactory.getLogger(AgentTraceArtifactService.class);
    private static final int SUMMARY_LIMIT = 240;
    private static final Pattern BEARER_TOKEN = Pattern.compile("(?i)bearer\\s+[^\\s,;]+");
    private static final Pattern EMAIL = Pattern.compile("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}");
    private static final Pattern MAINLAND_PHONE = Pattern.compile("(?<!\\d)1[3-9]\\d{9}(?!\\d)");
    private static final Pattern ID_CARD = Pattern.compile("(?i)\\d{17}[0-9x]");
    private static final Pattern SENSITIVE_ASSIGNMENT = Pattern.compile(
            "(?i)(\\b(?:password|token|secret|api[-_ ]?key|authorization|credential)\\b\\s*[:=]\\s*)[^\\s,;]+"
    );

    private final AgentTraceArtifactRepository repository;
    private final ObjectMapper objectMapper;

    public AgentTraceArtifactService(AgentTraceArtifactRepository repository,
                                     ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(Long runId, AgentStepName stepName, String artifactType, Object content, String summary) {
        if (runId == null || artifactType == null || artifactType.isBlank()) {
            return;
        }
        try {
            String safeSummary = safeSummary(summary);
            String safeArtifactType = safeArtifactType(artifactType);
            String json = toJson(redactedContent(safeArtifactType, safeSummary));
            AgentTraceArtifactEntity entity = new AgentTraceArtifactEntity();
            entity.setRunId(runId);
            entity.setStepName(stepName);
            entity.setArtifactType(safeArtifactType);
            entity.setContentSummary(safeSummary);
            entity.setContentJson(json);
            entity.setContentHash(hash(json));
            entity.setRedacted(true);
            repository.save(entity);
        } catch (RuntimeException ex) {
            log.warn("Failed to persist agent trace artifact. runId={}, type={}, error={}",
                runId, artifactType, ex.getClass().getSimpleName());
        }
    }

    private Map<String, Object> redactedContent(String artifactType, String safeSummary) {
        Map<String, Object> redaction = new LinkedHashMap<>();
        redaction.put("mode", "summary-only");
        redaction.put("rawContentRetained", false);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("artifactType", artifactType);
        data.put("summary", safeSummary);
        data.put("redaction", redaction);
        return data;
    }

    @Transactional(readOnly = true)
    public List<AgentLogDtos.ArtifactResponse> list(Long runId) {
        return repository.findByRunIdOrderByIdAsc(runId).stream()
                .map(AgentLogDtos.ArtifactResponse::from)
                .toList();
    }

    private String toJson(Object content) {
        try {
            return objectMapper.writeValueAsString(content);
        } catch (JsonProcessingException ex) {
            return "{\"serializationError\":\"[redacted]\"}";
        }
    }

    private String hash(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is unavailable", ex);
        }
    }

    private String compact(String value, int maxLength) {
        String text = value == null ? "" : value.trim();
        return text.length() > maxLength ? text.substring(0, maxLength) : text;
    }

    private String safeSummary(String value) {
        String text = compact(value, SUMMARY_LIMIT)
                .replaceAll("[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]", " ");
        text = SENSITIVE_ASSIGNMENT.matcher(text).replaceAll("$1[redacted]");
        text = BEARER_TOKEN.matcher(text).replaceAll("bearer [redacted]");
        text = EMAIL.matcher(text).replaceAll("[redacted-email]");
        text = MAINLAND_PHONE.matcher(text).replaceAll("[redacted-phone]");
        text = ID_CARD.matcher(text).replaceAll("[redacted-id]");
        return compact(text, SUMMARY_LIMIT);
    }

    private String safeArtifactType(String value) {
        String text = compact(value, 80);
        return text.matches("[A-Za-z0-9._-]+") ? text : "UNSAFE_ARTIFACT_TYPE";
    }

}
