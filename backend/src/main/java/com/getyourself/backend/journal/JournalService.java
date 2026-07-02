package com.getyourself.backend.journal;

import com.getyourself.backend.common.ApiException;
import com.getyourself.backend.common.PageResponse;
import com.getyourself.backend.mq.DomainEventPublisher;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
public class JournalService {
    private final JournalRepository journalRepository;
    private final DomainEventPublisher eventPublisher;
    private final ObjectMapper objectMapper;

    public JournalService(JournalRepository journalRepository,
                          DomainEventPublisher eventPublisher,
                          ObjectMapper objectMapper) {
        this.journalRepository = journalRepository;
        this.eventPublisher = eventPublisher;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public JournalDtos.JournalResponse create(String userId, JournalDtos.CreateJournalRequest request) {
        JournalEntryEntity entry = new JournalEntryEntity();
        entry.setUserId(userId);
        entry.setEntryDate(request.entryDate() != null ? request.entryDate() : LocalDate.now());
        entry.setTitle(request.title().trim());
        entry.setContent(request.content().trim());
        if (request.mood() != null && !request.mood().isBlank()) {
            entry.setMood(JournalEntryEntity.Mood.valueOf(request.mood().toUpperCase()));
        }
        entry.setLinkedTagIds(serializeLinkedTagIds(request.linkedTagIds()));

        JournalEntryEntity saved = journalRepository.save(entry);

        // Trigger growth tag extraction from journal entry
        try {
            eventPublisher.publishGrowthTagExtraction(saved.getId(), userId, "JOURNAL");
        } catch (Exception ignored) {
            // Best-effort async processing
        }

        return JournalDtos.JournalResponse.from(saved);
    }

    @Transactional(readOnly = true)
    public PageResponse<JournalDtos.JournalResponse> page(String userId, int page, int size) {
        PageRequest pageRequest = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 50));
        Page<JournalEntryEntity> result = journalRepository.findByUserIdOrderByEntryDateDesc(userId, pageRequest);
        return PageResponse.from(result, JournalDtos.JournalResponse::from);
    }

    @Transactional(readOnly = true)
    public List<JournalDtos.JournalResponse> listByDateRange(String userId, LocalDate start, LocalDate end) {
        return journalRepository.findByUserIdAndEntryDateBetweenOrderByEntryDateDesc(userId, start, end)
                .stream()
                .map(JournalDtos.JournalResponse::from)
                .toList();
    }

    @Transactional
    public JournalDtos.JournalResponse update(String userId, Long entryId, JournalDtos.UpdateJournalRequest request) {
        JournalEntryEntity entry = journalRepository.findByIdAndUserId(entryId, userId)
                .orElseThrow(() -> ApiException.notFound("日记不存在：" + entryId));

        if (request.entryDate() != null) {
            entry.setEntryDate(request.entryDate());
        }
        if (request.title() != null && !request.title().isBlank()) {
            entry.setTitle(request.title().trim());
        }
        if (request.content() != null && !request.content().isBlank()) {
            entry.setContent(request.content().trim());
        }
        if (request.mood() != null) {
            if (request.mood().isBlank()) {
                entry.setMood(null);
            } else {
                entry.setMood(JournalEntryEntity.Mood.valueOf(request.mood().toUpperCase()));
            }
        }
        if (request.linkedTagIds() != null) {
            entry.setLinkedTagIds(serializeLinkedTagIds(request.linkedTagIds()));
        }

        return JournalDtos.JournalResponse.from(journalRepository.save(entry));
    }

    @Transactional
    public void delete(String userId, Long entryId) {
        JournalEntryEntity entry = journalRepository.findByIdAndUserId(entryId, userId)
                .orElseThrow(() -> ApiException.notFound("日记不存在：" + entryId));
        journalRepository.delete(entry);
    }

    @Transactional(readOnly = true)
    public long count(String userId) {
        return journalRepository.countByUserId(userId);
    }

    private String serializeLinkedTagIds(List<Long> tagIds) {
        if (tagIds == null || tagIds.isEmpty()) {
            return "[]";
        }
        try {
            return objectMapper.writeValueAsString(tagIds);
        } catch (JsonProcessingException e) {
            return "[]";
        }
    }
}
