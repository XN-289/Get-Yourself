package com.getyourself.backend.journal;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface JournalRepository extends JpaRepository<JournalEntryEntity, Long> {

    List<JournalEntryEntity> findByUserIdOrderByEntryDateDesc(String userId);

    Page<JournalEntryEntity> findByUserIdOrderByEntryDateDesc(String userId, Pageable pageable);

    Optional<JournalEntryEntity> findByIdAndUserId(Long id, String userId);

    List<JournalEntryEntity> findByUserIdAndEntryDateBetweenOrderByEntryDateDesc(
            String userId, LocalDate start, LocalDate end);

    long countByUserId(String userId);
}
