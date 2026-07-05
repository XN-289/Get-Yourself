package com.getyourself.backend.ai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.*;

/**
 * 简化版AI推荐控制器
 *
 * 只保留事件推荐接口，砍掉计划生成和自我分析。
 * 前端调用：POST /api/ai/recommend-events
 */
@RestController
@RequestMapping("/api/ai")
public class SimpleAiController {

    private final SimpleAiService aiService;

    public SimpleAiController(SimpleAiService aiService) {
        this.aiService = aiService;
    }

    /**
     * 事件推荐
     *
     * 请求示例：
     * {
     *   "need": "想找线上实习机会",
     *   "category": "",
     *   "location": ""
     * }
     */
    @PostMapping("/recommend-events")
    public SimpleAiService.RecommendationResult recommendEvents(
            @Valid @RequestBody RecommendRequest request) {
        return aiService.recommend(request.need(), request.category(), request.location());
    }

    /**
     * 请求DTO
     */
    public record RecommendRequest(
            @NotBlank(message = "需求不能为空") String need,
            String category,
            String location
    ) {}
}
