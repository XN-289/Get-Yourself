package com.getyourself.backend.workbench;

import com.getyourself.backend.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;

@Service
public class WorkbenchDeviceService {
    private static final Duration CODE_TTL = Duration.ofMinutes(10);
    private static final int MAX_ACTIVE_DEVICES = 5;
    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private final WorkbenchDeviceRepository repository;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public WorkbenchDeviceService(WorkbenchDeviceRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    @Transactional
    public WorkbenchDeviceDtos.CreateCodeResponse createCode(String userId) {
        if (repository.countByUserIdAndStatus(userId, WorkbenchDeviceEntity.STATUS_ACTIVE) >= MAX_ACTIVE_DEVICES) {
            throw ApiException.badRequest("最多保留 5 台活跃设备，请先解绑不用的工位");
        }
        revokePendingDevices(userId);

        String deviceCode = uniqueDeviceCode();
        WorkbenchDeviceEntity entity = new WorkbenchDeviceEntity();
        entity.setUserId(userId);
        entity.setDeviceName("待确认设备");
        entity.setInstallIdHash(hash("pending:" + deviceCode));
        entity.setCodeHash(hash(deviceCode));
        entity.setStatus(WorkbenchDeviceEntity.STATUS_PENDING);
        entity.setExpiresAt(now().plus(CODE_TTL));
        entity = repository.save(entity);
        return new WorkbenchDeviceDtos.CreateCodeResponse(entity.getId(), deviceCode, entity.getExpiresAt());
    }

    @Transactional(readOnly = true)
    public List<WorkbenchDeviceDtos.DeviceResponse> list(String userId) {
        Instant now = now();
        return repository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .filter(item -> !WorkbenchDeviceEntity.STATUS_REVOKED.equals(item.getStatus())
                        && !WorkbenchDeviceEntity.STATUS_EXPIRED.equals(item.getStatus()))
                .map(item -> WorkbenchDeviceDtos.DeviceResponse.from(item, now))
                .toList();
    }

    @Transactional
    public WorkbenchDeviceDtos.BindResponse bind(WorkbenchDeviceDtos.BindRequest request) {
        String deviceCode = request.deviceCode().trim().toUpperCase(Locale.ROOT);
        WorkbenchDeviceEntity entity = repository
                .findPendingByCodeHashForUpdate(hash(deviceCode), WorkbenchDeviceEntity.STATUS_PENDING)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "绑定码无效或已使用，请重新生成"));

        if (entity.getExpiresAt() == null || !entity.getExpiresAt().isAfter(now())) {
            entity.setStatus(WorkbenchDeviceEntity.STATUS_EXPIRED);
            entity.setCodeHash(null);
            repository.save(entity);
            throw ApiException.badRequest("绑定码已过期，请重新生成");
        }

        String installIdHash = hash(request.installId().trim());
        WorkbenchDeviceEntity previousDevice = repository.findFirstByUserIdAndInstallIdHashAndStatus(
                        entity.getUserId(),
                        installIdHash,
                        WorkbenchDeviceEntity.STATUS_ACTIVE
                )
                .orElse(null);
        if (previousDevice == null
                && repository.countByUserIdAndStatus(entity.getUserId(), WorkbenchDeviceEntity.STATUS_ACTIVE)
                >= MAX_ACTIVE_DEVICES) {
            throw ApiException.badRequest("最多保留 5 台活跃设备，请先解绑不用的工位");
        }

        String deviceToken = randomToken();
        if (previousDevice != null) {
            revokeEntity(previousDevice);
        }
        entity.setDeviceName(compact(request.deviceName()));
        entity.setInstallIdHash(installIdHash);
        entity.setCodeHash(null);
        entity.setDeviceTokenHash(hash(deviceToken));
        entity.setStatus(WorkbenchDeviceEntity.STATUS_ACTIVE);
        entity.setExpiresAt(null);
        entity.setBoundAt(now());
        entity.setLastActiveAt(now());
        repository.save(entity);
        return new WorkbenchDeviceDtos.BindResponse(entity.getId(), entity.getDeviceName(), deviceToken, entity.getBoundAt());
    }

    @Transactional
    public WorkbenchDeviceDtos.DeviceResponse status(String deviceToken) {
        WorkbenchDeviceEntity entity = requireActiveDevice(deviceToken);
        entity.setLastActiveAt(now());
        repository.save(entity);
        return WorkbenchDeviceDtos.DeviceResponse.from(entity, now());
    }

    @Transactional
    public void revoke(String userId, Long deviceId) {
        WorkbenchDeviceEntity entity = repository.findById(deviceId)
                .filter(item -> item.getUserId().equals(userId))
                .orElseThrow(() -> ApiException.notFound("设备不存在或已解绑"));
        revokeEntity(entity);
    }

    @Transactional
    public void disconnect(String deviceToken) {
        WorkbenchDeviceEntity entity = repository
                .findFirstByDeviceTokenHashAndStatus(hash(deviceToken), WorkbenchDeviceEntity.STATUS_ACTIVE)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "本地凭证无效或设备已解绑"));
        revokeEntity(entity);
    }

    private WorkbenchDeviceEntity requireActiveDevice(String deviceToken) {
        if (deviceToken == null || deviceToken.isBlank()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "缺少本地设备凭证");
        }
        return repository
                .findFirstByDeviceTokenHashAndStatus(hash(deviceToken), WorkbenchDeviceEntity.STATUS_ACTIVE)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "本地凭证无效或设备已解绑"));
    }

    private void revokePendingDevices(String userId) {
        repository.findByUserIdAndStatusOrderByCreatedAtDesc(userId, WorkbenchDeviceEntity.STATUS_PENDING)
                .forEach(item -> {
                    item.setStatus(item.getExpiresAt() != null && item.getExpiresAt().isAfter(now())
                            ? WorkbenchDeviceEntity.STATUS_REVOKED
                            : WorkbenchDeviceEntity.STATUS_EXPIRED);
                    item.setCodeHash(null);
                    item.setRevokedAt(now());
                    repository.save(item);
                });
    }

    private void revokeEntity(WorkbenchDeviceEntity entity) {
        entity.setStatus(WorkbenchDeviceEntity.STATUS_REVOKED);
        entity.setCodeHash(null);
        entity.setDeviceTokenHash(null);
        entity.setExpiresAt(null);
        entity.setRevokedAt(now());
        repository.save(entity);
    }

    private String uniqueDeviceCode() {
        for (int attempt = 0; attempt < 10; attempt++) {
            String code = "GY-" + randomCodeGroup() + "-" + randomCodeGroup();
            if (repository.findFirstByCodeHashAndStatus(hash(code), WorkbenchDeviceEntity.STATUS_PENDING).isEmpty()) {
                return code;
            }
        }
        throw new IllegalStateException("无法生成唯一设备绑定码");
    }

    private String randomCodeGroup() {
        StringBuilder value = new StringBuilder(4);
        for (int index = 0; index < 4; index++) {
            value.append(CODE_ALPHABET.charAt(random.nextInt(CODE_ALPHABET.length())));
        }
        return value.toString();
    }

    private String randomToken() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private Instant now() {
        return clock.instant();
    }

    private static String compact(String value) {
        String text = value == null ? "" : value.replaceAll("[\\x00-\\x1F\\x7F]", " ").trim();
        return text.length() <= 80 ? text : text.substring(0, 80);
    }

    private static String hash(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is unavailable", ex);
        }
    }
}
