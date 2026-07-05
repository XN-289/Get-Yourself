package com.getyourself.backend.wechat;

import java.time.Instant;

public class WechatDtos {

    public record WechatLoginRequest(String code) {}

    public record BindPhoneRequest(String code) {}

    public record UpdateProfileRequest(
            String nickname,
            String avatarUrl,
            String school,
            String major
    ) {}

    public record WechatLoginResponse(
            String token,
            Instant expiresAt,
            boolean isNewUser,
            UserResponse user
    ) {}

    public record UserResponse(
            String publicUserId,
            String nickname,
            String avatarUrl,
            String phone,
            String school,
            String major,
            String role
    ) {
        public static UserResponse from(com.getyourself.backend.auth.UserEntity entity) {
            return new UserResponse(
                    entity.getPublicUserId(),
                    entity.getNickname() != null ? entity.getNickname() : entity.getUsername(),
                    entity.getAvatarUrl(),
                    entity.getPhone(),
                    entity.getSchool(),
                    entity.getMajor(),
                    entity.getRole().name()
            );
        }
    }

    public record Code2SessionResult(
            boolean success,
            String openid,
            String sessionKey,
            String unionid,
            String errorMessage
    ) {
        public static Code2SessionResult success(String openid, String sessionKey, String unionid) {
            return new Code2SessionResult(true, openid, sessionKey, unionid, null);
        }

        public static Code2SessionResult error(String message) {
            return new Code2SessionResult(false, null, null, null, message);
        }
    }
}
