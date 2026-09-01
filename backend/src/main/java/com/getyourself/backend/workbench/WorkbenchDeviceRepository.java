package com.getyourself.backend.workbench;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

import java.util.List;
import java.util.Optional;

public interface WorkbenchDeviceRepository extends JpaRepository<WorkbenchDeviceEntity, Long> {
    List<WorkbenchDeviceEntity> findByUserIdOrderByCreatedAtDesc(String userId);

    List<WorkbenchDeviceEntity> findByUserIdAndStatusOrderByCreatedAtDesc(String userId, String status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select device from WorkbenchDeviceEntity device
            where device.codeHash = :codeHash and device.status = :status
            """)
    Optional<WorkbenchDeviceEntity> findPendingByCodeHashForUpdate(
            @Param("codeHash") String codeHash,
            @Param("status") String status
    );

    Optional<WorkbenchDeviceEntity> findFirstByCodeHashAndStatus(String codeHash, String status);

    Optional<WorkbenchDeviceEntity> findFirstByDeviceTokenHashAndStatus(String tokenHash, String status);

    Optional<WorkbenchDeviceEntity> findFirstByUserIdAndInstallIdHashAndStatus(
            String userId,
            String installIdHash,
            String status
    );

    long countByUserIdAndStatus(String userId, String status);
}
