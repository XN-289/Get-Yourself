package com.getyourself.backend.eventquality;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface EventQualityReportRepository extends JpaRepository<EventQualityReportEntity, Long> {
    Optional<EventQualityReportEntity> findByEventId(Long eventId);
}
