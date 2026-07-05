package com.getyourself.backend.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.getyourself.backend.event.EventCategory;
import com.getyourself.backend.event.EventEntity;
import com.getyourself.backend.event.EventRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 简化版AI推荐服务
 *
 * 设计原则（产品经理决策）：
 * 1. 单次LLM调用，替代多Agent架构（成本降低70%）
 * 2. 规则评分作为主要排序，LLM只做最终精排+生成理由
 * 3. LLM不可用时降级为纯规则推荐
 * 4. 候选事件限制为10个，推荐结果限制为3个
 */
@Service
public class SimpleAiService {
    private static final Logger log = LoggerFactory.getLogger(SimpleAiService.class);
    private static final int MAX_CANDIDATES = 10;
    private static final int MAX_RECOMMENDATIONS = 3;
    private static final int MIN_SCORE = 50;

    private final EventRepository eventRepository;
    private final ObjectMapper objectMapper;

    @Value("${ai.api.url:}")
    private String aiApiUrl;

    @Value("${ai.api.key:}")
    private String aiApiKey;

    @Value("${ai.model:deepseek-chat}")
    private String aiModel;

    public SimpleAiService(EventRepository eventRepository, ObjectMapper objectMapper) {
        this.eventRepository = eventRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * 事件推荐
     */
    public RecommendationResult recommend(String need, String category, String location) {
        // 1. 搜索候选事件
        List<EventEntity> candidates = searchCandidates(need, category, location);
        if (candidates.isEmpty()) {
            return RecommendationResult.empty("没有找到匹配的活动");
        }

        // 2. 规则评分
        List<ScoredEvent> scored = candidates.stream()
                .map(e -> ruleScore(e, need))
                .filter(s -> s.score >= MIN_SCORE)
                .sorted((a, b) -> Integer.compare(b.score, a.score))
                .limit(MAX_CANDIDATES)
                .toList();

        if (scored.isEmpty()) {
            return RecommendationResult.empty("没有足够匹配的活动，试试换个需求描述");
        }

        // 3. 尝试LLM精排
        if (isAiEnabled()) {
            try {
                return llmRerank(scored, need);
            } catch (Exception e) {
                log.warn("LLM推荐失败，降级为规则推荐: {}", e.getMessage());
            }
        }

        // 4. 降级：规则推荐
        return ruleBasedResult(scored);
    }

    /**
     * 搜索候选事件
     */
    private List<EventEntity> searchCandidates(String need, String category, String location) {
        List<EventEntity> results = eventRepository.findAll().stream()
                .filter(e -> !e.isExpired())
                .filter(e -> category == null || category.isEmpty() ||
                        (e.getCategory() != null && e.getCategory().name().equalsIgnoreCase(category)))
                .filter(e -> location == null || location.isEmpty() ||
                        (e.getLocation() != null && e.getLocation().contains(location)))
                .toList();

        if (need != null && !need.isEmpty()) {
            String needLower = need.toLowerCase();
            List<EventEntity> keywordFiltered = results.stream()
                    .filter(e -> matchesKeyword(e, needLower))
                    .toList();
            if (!keywordFiltered.isEmpty()) {
                return keywordFiltered;
            }
        }

        return results;
    }

    /**
     * 关键词匹配
     */
    private boolean matchesKeyword(EventEntity event, String keyword) {
        String text = String.join(" ",
                event.getTitle(),
                event.getOrganizationName(),
                event.getLocation(),
                event.getContent(),
                event.getSkill(),
                event.getCategory() != null ? event.getCategory().label() : ""
        ).toLowerCase();

        for (String word : keyword.split("[\\s,，;；、]+")) {
            if (!word.isEmpty() && text.contains(word)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 规则评分
     */
    private ScoredEvent ruleScore(EventEntity event, String need) {
        String eventText = String.join(" ",
                event.getTitle(),
                event.getOrganizationName(),
                event.getLocation(),
                event.getContent(),
                event.getSkill(),
                event.getCategory() != null ? event.getCategory().label() : ""
        ).toLowerCase();

        String needLower = need != null ? need.toLowerCase() : "";
        int rawScore = 0;
        List<String> evidence = new ArrayList<>();

        // 关键词匹配
        for (String term : needLower.split("[\\s,，;；、]+")) {
            if (!term.isEmpty() && eventText.contains(term)) {
                rawScore += term.length() >= 2 ? 3 : 1;
                evidence.add("关键词匹配：" + term);
            }
        }

        // 意图匹配
        rawScore += scoreIntent(needLower, eventText, evidence,
                List.of("实习", "兼职", "工作", "求职"), "求职相关");
        rawScore += scoreIntent(needLower, eventText, evidence,
                List.of("志愿", "公益", "服务", "社区"), "志愿服务相关");
        rawScore += scoreIntent(needLower, eventText, evidence,
                List.of("科研", "竞赛", "比赛", "创新"), "科研竞赛相关");
        rawScore += scoreIntent(needLower, eventText, evidence,
                List.of("线上", "远程", "在家"), "线上参与");
        rawScore += scoreIntent(needLower, eventText, evidence,
                List.of("编程", "开发", "技术", "代码"), "技术相关");
        rawScore += scoreIntent(needLower, eventText, evidence,
                List.of("运营", "内容", "文案", "新媒体"), "运营相关");

        int score = rawScore <= 0 ? 40 : Math.min(92, 43 + rawScore * 7);
        return new ScoredEvent(event, score, evidence.stream().distinct().limit(5).toList());
    }

    private int scoreIntent(String need, String eventText, List<String> evidence,
                           List<String> words, String label) {
        boolean needMatched = words.stream().anyMatch(need::contains);
        boolean eventMatched = words.stream().anyMatch(eventText::contains);
        if (needMatched && eventMatched) {
            evidence.add(label);
            return 4;
        }
        return 0;
    }

    /**
     * LLM精排
     */
    private RecommendationResult llmRerank(List<ScoredEvent> scored, String need) {
        String prompt = buildPrompt(scored, need);
        String response = callLLM(prompt);
        return parseResponse(response, scored);
    }

    private String buildPrompt(List<ScoredEvent> scored, String need) {
        StringBuilder sb = new StringBuilder();
        sb.append("你是学生成长机会推荐助手。根据学生需求和候选事件，返回推荐排序。\n");
        sb.append("只能推荐候选列表中的事件，不能编造。\n\n");
        sb.append("学生需求：").append(need).append("\n\n");
        sb.append("候选事件：\n");

        for (int i = 0; i < scored.size(); i++) {
            ScoredEvent se = scored.get(i);
            EventEntity e = se.event;
            sb.append(i + 1).append(". ")
              .append(e.getTitle()).append(" | ")
              .append(e.getCategory() != null ? e.getCategory().label() : "").append(" | ")
              .append(e.getLocation()).append(" | ")
              .append(e.getContent() != null ? e.getContent().substring(0, Math.min(80, e.getContent().length())) : "")
              .append("\n");
        }

        sb.append("\n请返回JSON格式（最多3个推荐）：\n");
        sb.append("{\"recommendations\": [{\"index\": 1, \"score\": 85, \"reason\": \"推荐理由\"}]}\n");
        return sb.toString();
    }

    private String callLLM(String prompt) {
        RestTemplate restTemplate = new RestTemplate();

        Map<String, Object> body = new HashMap<>();
        body.put("model", aiModel);
        body.put("messages", List.of(
                Map.of("role", "system", "content", "你是推荐助手，只返回JSON，不要解释。"),
                Map.of("role", "user", "content", prompt)
        ));
        body.put("temperature", 0.3);
        body.put("max_tokens", 500);

        try {
            org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
            headers.set("Content-Type", "application/json");
            headers.set("Authorization", "Bearer " + aiApiKey);

            org.springframework.http.HttpEntity<Map<String, Object>> request =
                    new org.springframework.http.HttpEntity<>(body, headers);

            String response = restTemplate.postForObject(aiApiUrl, request, String.class);
            JsonNode node = objectMapper.readTree(response);
            return node.path("choices").path(0).path("message").path("content").asText();
        } catch (Exception e) {
            log.error("调用LLM失败", e);
            throw new RuntimeException("AI服务调用失败");
        }
    }

    private RecommendationResult parseResponse(String response, List<ScoredEvent> scored) {
        try {
            String json = response.trim();
            if (json.startsWith("```")) {
                json = json.replaceAll("```json\\s*", "").replaceAll("```\\s*", "");
            }

            JsonNode root = objectMapper.readTree(json);
            JsonNode recs = root.path("recommendations");

            List<Recommendation> recommendations = new ArrayList<>();
            for (JsonNode rec : recs) {
                int index = rec.path("index").asInt(1) - 1;
                int score = rec.path("score").asInt(70);
                String reason = rec.path("reason").asText("与需求相关");

                if (index >= 0 && index < scored.size()) {
                    recommendations.add(new Recommendation(
                            scored.get(index).event,
                            score,
                            reason,
                            scored.get(index).evidence
                    ));
                }
            }

            return new RecommendationResult("deepseek", "已为你找到匹配的活动",
                    recommendations.stream().limit(MAX_RECOMMENDATIONS).toList());
        } catch (Exception e) {
            log.warn("解析LLM响应失败: {}", e.getMessage());
            throw new RuntimeException("AI响应解析失败");
        }
    }

    /**
     * 规则降级推荐
     */
    private RecommendationResult ruleBasedResult(List<ScoredEvent> scored) {
        List<Recommendation> recommendations = scored.stream()
                .limit(MAX_RECOMMENDATIONS)
                .map(se -> new Recommendation(
                        se.event,
                        se.score,
                        buildDefaultReason(se),
                        se.evidence
                ))
                .toList();

        return new RecommendationResult("rule", "已为你找到匹配的活动", recommendations);
    }

    private String buildDefaultReason(ScoredEvent se) {
        if (se.evidence.isEmpty()) {
            return "该活动与你的需求有一定相关性";
        }
        return "匹配点：" + String.join("；", se.evidence.stream().limit(3).toList());
    }

    private boolean isAiEnabled() {
        return aiApiKey != null && !aiApiKey.isEmpty() && !aiApiKey.equals("your_deepseek_api_key") && !aiApiKey.equals("YOUR_SECRET_HERE");
    }

    // ========== 内部数据类 ==========

    public record ScoredEvent(EventEntity event, int score, List<String> evidence) {}

    public record Recommendation(
            EventEntity event,
            int score,
            String reason,
            List<String> evidence
    ) {}

    public record RecommendationResult(
            String mode,
            String message,
            List<Recommendation> recommendations
    ) {
        public static RecommendationResult empty(String message) {
            return new RecommendationResult("none", message, List.of());
        }
    }
}
