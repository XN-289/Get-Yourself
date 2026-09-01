package com.getyourself.backend.workbench;

import com.getyourself.backend.common.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WorkbenchDeviceServiceTest {
    private static final Instant NOW = Instant.parse("2026-09-01T10:00:00Z");

    @Mock
    private WorkbenchDeviceRepository repository;

    private WorkbenchDeviceService service;

    @BeforeEach
    void setUp() {
        service = new WorkbenchDeviceService(repository, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void createCodeUsesShortTtlAndRevokesPreviousPendingCode() {
        WorkbenchDeviceEntity previous = pendingEntity();
        when(repository.countByUserIdAndStatus("user-1", WorkbenchDeviceEntity.STATUS_ACTIVE)).thenReturn(0L);
        when(repository.findByUserIdAndStatusOrderByCreatedAtDesc("user-1", WorkbenchDeviceEntity.STATUS_PENDING))
                .thenReturn(List.of(previous));
        when(repository.findFirstByCodeHashAndStatus(any(), any())).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        WorkbenchDeviceDtos.CreateCodeResponse response = service.createCode("user-1");

        assertThat(response.deviceCode()).matches("GY-[A-Z0-9]{4}-[A-Z0-9]{4}");
        assertThat(response.expiresAt()).isEqualTo(NOW.plus(Duration.ofMinutes(10)));
        assertThat(previous.getStatus()).isEqualTo(WorkbenchDeviceEntity.STATUS_REVOKED);
        assertThat(previous.getCodeHash()).isNull();
    }

    @Test
    void bindConsumesCodeOnceAndReturnsOnlyTheDeviceTokenSecret() {
        WorkbenchDeviceEntity entity = pendingEntity();
        when(repository.findPendingByCodeHashForUpdate(any(), any())).thenReturn(Optional.of(entity));
        when(repository.countByUserIdAndStatus("user-1", WorkbenchDeviceEntity.STATUS_ACTIVE)).thenReturn(0L);
        when(repository.findFirstByUserIdAndInstallIdHashAndStatus(
                any(),
                any(),
                any()
        )).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        WorkbenchDeviceDtos.BindResponse response = service.bind(new WorkbenchDeviceDtos.BindRequest(
                "gy-abcd-2345",
                "我的本机工位",
                "install-1"
        ));

        assertThat(response.deviceToken()).isNotBlank().hasSize(43);
        assertThat(response.deviceName()).isEqualTo("我的本机工位");
        assertThat(entity.getStatus()).isEqualTo(WorkbenchDeviceEntity.STATUS_ACTIVE);
        assertThat(entity.getCodeHash()).isNull();
        assertThat(entity.getDeviceTokenHash()).hasSize(64).isNotEqualTo(response.deviceToken());
        assertThat(entity.getInstallIdHash()).hasSize(64);
    }

    @Test
    void expiredCodeIsRejectedAndCannotBeReused() {
        WorkbenchDeviceEntity entity = pendingEntity();
        entity.setExpiresAt(NOW.minusSeconds(1));
        when(repository.findPendingByCodeHashForUpdate(any(), any())).thenReturn(Optional.of(entity));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        assertThatThrownBy(() -> service.bind(new WorkbenchDeviceDtos.BindRequest(
                "GY-ABCD-2345",
                "我的本机工位",
                "install-1"
        )))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("绑定码已过期");
        assertThat(entity.getStatus()).isEqualTo(WorkbenchDeviceEntity.STATUS_EXPIRED);
        assertThat(entity.getCodeHash()).isNull();
    }

    @Test
    void rebindingTheSameInstallationRevokesItsPreviousDeviceToken() {
        WorkbenchDeviceEntity previous = activeEntity();
        WorkbenchDeviceEntity entity = pendingEntity();
        when(repository.findPendingByCodeHashForUpdate(any(), any())).thenReturn(Optional.of(entity));
        when(repository.findFirstByUserIdAndInstallIdHashAndStatus(
                any(),
                any(),
                any()
        )).thenReturn(Optional.of(previous));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        WorkbenchDeviceDtos.BindResponse response = service.bind(new WorkbenchDeviceDtos.BindRequest(
                "GY-ABCD-2345",
                "重绑的本机工位",
                "install-1"
        ));

        assertThat(previous.getStatus()).isEqualTo(WorkbenchDeviceEntity.STATUS_REVOKED);
        assertThat(previous.getDeviceTokenHash()).isNull();
        assertThat(entity.getStatus()).isEqualTo(WorkbenchDeviceEntity.STATUS_ACTIVE);
        assertThat(entity.getDeviceTokenHash()).isNotBlank();
    }

    @Test
    void rejectBindingWhenDeviceLimitIsReached() {
        WorkbenchDeviceEntity entity = pendingEntity();
        when(repository.findPendingByCodeHashForUpdate(any(), any())).thenReturn(Optional.of(entity));
        when(repository.findFirstByUserIdAndInstallIdHashAndStatus(
                any(),
                any(),
                any()
        )).thenReturn(Optional.empty());
        when(repository.countByUserIdAndStatus("user-1", WorkbenchDeviceEntity.STATUS_ACTIVE)).thenReturn(5L);

        assertThatThrownBy(() -> service.bind(new WorkbenchDeviceDtos.BindRequest(
                "GY-ABCD-2345",
                "第六台设备",
                "install-1"
        )))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("最多保留 5 台活跃设备");
        assertThat(entity.getStatus()).isEqualTo(WorkbenchDeviceEntity.STATUS_PENDING);
    }

    @Test
    void statusRefreshesLastActiveAt() {
        WorkbenchDeviceEntity entity = activeEntity();
        entity.setLastActiveAt(NOW.minus(Duration.ofMinutes(5)));
        when(repository.findFirstByDeviceTokenHashAndStatus(any(), any())).thenReturn(Optional.of(entity));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        WorkbenchDeviceDtos.DeviceResponse response = service.status("device-token");

        assertThat(response.id()).isEqualTo(entity.getId());
        assertThat(entity.getLastActiveAt()).isEqualTo(NOW);
    }

    @Test
    void revokeClearsCredentialHashes() {
        WorkbenchDeviceEntity entity = activeEntity();
        when(repository.findById(12L)).thenReturn(Optional.of(entity));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        service.revoke("user-1", 12L);

        assertThat(entity.getStatus()).isEqualTo(WorkbenchDeviceEntity.STATUS_REVOKED);
        assertThat(entity.getCodeHash()).isNull();
        assertThat(entity.getDeviceTokenHash()).isNull();
        assertThat(entity.getRevokedAt()).isEqualTo(NOW);
    }

    @Test
    void rejectCreatingCodeWhenDeviceLimitIsReached() {
        when(repository.countByUserIdAndStatus("user-1", WorkbenchDeviceEntity.STATUS_ACTIVE)).thenReturn(5L);

        assertThatThrownBy(() -> service.createCode("user-1"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("最多保留 5 台活跃设备");
        verify(repository, never()).save(any());
    }

    @Test
    void disconnectClearsCredentialHashes() {
        WorkbenchDeviceEntity entity = activeEntity();
        when(repository.findFirstByDeviceTokenHashAndStatus(any(), any())).thenReturn(Optional.of(entity));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        service.disconnect("device-token");

        assertThat(entity.getStatus()).isEqualTo(WorkbenchDeviceEntity.STATUS_REVOKED);
        assertThat(entity.getDeviceTokenHash()).isNull();
        assertThat(entity.getRevokedAt()).isEqualTo(NOW);
    }

    private WorkbenchDeviceEntity pendingEntity() {
        WorkbenchDeviceEntity entity = new WorkbenchDeviceEntity();
        entity.setUserId("user-1");
        entity.setDeviceName("待确认设备");
        entity.setInstallIdHash("pending");
        entity.setCodeHash("code-hash");
        entity.setStatus(WorkbenchDeviceEntity.STATUS_PENDING);
        entity.setExpiresAt(NOW.plus(Duration.ofMinutes(10)));
        return entity;
    }

    private WorkbenchDeviceEntity activeEntity() {
        WorkbenchDeviceEntity entity = new WorkbenchDeviceEntity();
        entity.setUserId("user-1");
        entity.setDeviceName("我的本机工位");
        entity.setInstallIdHash("install-hash");
        entity.setDeviceTokenHash("token-hash");
        entity.setStatus(WorkbenchDeviceEntity.STATUS_ACTIVE);
        entity.setBoundAt(NOW);
        return entity;
    }
}
