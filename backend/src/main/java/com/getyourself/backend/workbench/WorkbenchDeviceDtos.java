package com.getyourself.backend.workbench;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public final class WorkbenchDeviceDtos {
    private WorkbenchDeviceDtos() {
    }

    public record DeviceResponse(
            Long id,
            String deviceName,
            String status,
            Instant expiresAt,
            Instant boundAt,
            Instant lastActiveAt,
            Instant createdAt
    ) {
        static DeviceResponse from(WorkbenchDeviceEntity entity, Instant now) {
            String status = entity.getStatus();
            if (WorkbenchDeviceEntity.STATUS_PENDING.equals(status)
                    && entity.getExpiresAt() != null
                    && entity.getExpiresAt().isBefore(now)) {
                status = WorkbenchDeviceEntity.STATUS_EXPIRED;
            }
            return new DeviceResponse(
                    entity.getId(),
                    entity.getDeviceName(),
                    status,
                    entity.getExpiresAt(),
                    entity.getBoundAt(),
                    entity.getLastActiveAt(),
                    entity.getCreatedAt()
            );
        }
    }

    public record CreateCodeResponse(
            Long id,
            String deviceCode,
            Instant expiresAt
    ) {
    }

    public record BindRequest(
            @NotBlank
            @Pattern(regexp = "GY-[A-Z0-9]{4}(-[A-Z0-9]{4}){0,2}")
            String deviceCode,
            @NotBlank
            @Size(max = 80)
            String deviceName,
            @NotBlank
            @Pattern(regexp = "[A-Za-z0-9_-]{16,128}")
            String installId
    ) {
    }

    public record BindResponse(
            Long deviceId,
            String deviceName,
            String deviceToken,
            Instant boundAt
    ) {
    }
}
