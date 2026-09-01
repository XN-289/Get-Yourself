package com.getyourself.backend.workbench;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(
        name = "workbench_devices",
        indexes = {
                @Index(name = "idx_workbench_devices_user_status", columnList = "user_id,status,created_at"),
                @Index(name = "idx_workbench_devices_install", columnList = "user_id,install_id_hash,status")
        }
)
public class WorkbenchDeviceEntity {
    public static final String STATUS_PENDING = "pending";
    public static final String STATUS_ACTIVE = "active";
    public static final String STATUS_REVOKED = "revoked";
    public static final String STATUS_EXPIRED = "expired";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, length = 64)
    private String userId;

    @Column(name = "device_name", nullable = false, length = 80)
    private String deviceName;

    @Column(name = "install_id_hash", nullable = false, columnDefinition = "char(64)")
    private String installIdHash;

    @Column(name = "code_hash", columnDefinition = "char(64)")
    private String codeHash;

    @Column(name = "device_token_hash", columnDefinition = "char(64)")
    private String deviceTokenHash;

    @Column(nullable = false, length = 20)
    private String status;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(name = "bound_at")
    private Instant boundAt;

    @Column(name = "last_active_at")
    private Instant lastActiveAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void prePersist() {
        Instant now = Instant.now();
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getDeviceName() {
        return deviceName;
    }

    public void setDeviceName(String deviceName) {
        this.deviceName = deviceName;
    }

    public String getInstallIdHash() {
        return installIdHash;
    }

    public void setInstallIdHash(String installIdHash) {
        this.installIdHash = installIdHash;
    }

    public String getCodeHash() {
        return codeHash;
    }

    public void setCodeHash(String codeHash) {
        this.codeHash = codeHash;
    }

    public String getDeviceTokenHash() {
        return deviceTokenHash;
    }

    public void setDeviceTokenHash(String deviceTokenHash) {
        this.deviceTokenHash = deviceTokenHash;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(Instant expiresAt) {
        this.expiresAt = expiresAt;
    }

    public Instant getBoundAt() {
        return boundAt;
    }

    public void setBoundAt(Instant boundAt) {
        this.boundAt = boundAt;
    }

    public Instant getLastActiveAt() {
        return lastActiveAt;
    }

    public void setLastActiveAt(Instant lastActiveAt) {
        this.lastActiveAt = lastActiveAt;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setRevokedAt(Instant revokedAt) {
        this.revokedAt = revokedAt;
    }
}
