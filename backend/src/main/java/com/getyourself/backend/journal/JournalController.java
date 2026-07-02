package com.getyourself.backend.journal;

import com.getyourself.backend.common.CurrentUser;
import com.getyourself.backend.common.PageResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/journal")
public class JournalController {
    private final JournalService journalService;
    private final CurrentUser currentUser;

    public JournalController(JournalService journalService, CurrentUser currentUser) {
        this.journalService = journalService;
        this.currentUser = currentUser;
    }

    @PostMapping
    public JournalDtos.JournalResponse create(@Valid @RequestBody JournalDtos.CreateJournalRequest request,
                                              HttpServletRequest servletRequest) {
        return journalService.create(currentUser.id(servletRequest), request);
    }

    @GetMapping("/page")
    public PageResponse<JournalDtos.JournalResponse> page(@RequestParam(defaultValue = "0") int page,
                                                          @RequestParam(defaultValue = "10") int size,
                                                          HttpServletRequest request) {
        return journalService.page(currentUser.id(request), page, size);
    }

    @GetMapping("/range")
    public List<JournalDtos.JournalResponse> range(@RequestParam LocalDate start,
                                                   @RequestParam LocalDate end,
                                                   HttpServletRequest request) {
        return journalService.listByDateRange(currentUser.id(request), start, end);
    }

    @PutMapping("/{entryId}")
    public JournalDtos.JournalResponse update(@PathVariable Long entryId,
                                              @Valid @RequestBody JournalDtos.UpdateJournalRequest request,
                                              HttpServletRequest servletRequest) {
        return journalService.update(currentUser.id(servletRequest), entryId, request);
    }

    @DeleteMapping("/{entryId}")
    public void delete(@PathVariable Long entryId, HttpServletRequest request) {
        journalService.delete(currentUser.id(request), entryId);
    }
}
