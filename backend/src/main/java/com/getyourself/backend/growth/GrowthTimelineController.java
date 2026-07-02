package com.getyourself.backend.growth;

import com.getyourself.backend.common.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/growth")
public class GrowthTimelineController {
    private final GrowthTimelineService growthTimelineService;
    private final CurrentUser currentUser;

    public GrowthTimelineController(GrowthTimelineService growthTimelineService, CurrentUser currentUser) {
        this.growthTimelineService = growthTimelineService;
        this.currentUser = currentUser;
    }

    @GetMapping("/timeline")
    public List<GrowthTimelineDtos.TimelineItem> timeline(@RequestParam(defaultValue = "50") int limit,
                                                          HttpServletRequest request) {
        return growthTimelineService.timeline(currentUser.id(request), limit);
    }

    @GetMapping("/summary")
    public GrowthTimelineDtos.GrowthSummary summary(HttpServletRequest request) {
        return growthTimelineService.summary(currentUser.id(request));
    }
}
