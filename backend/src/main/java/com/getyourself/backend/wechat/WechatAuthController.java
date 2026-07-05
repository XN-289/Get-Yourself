package com.getyourself.backend.wechat;

import com.getyourself.backend.auth.AuthService;
import com.getyourself.backend.auth.UserEntity;
import com.getyourself.backend.auth.UserRepository;
import com.getyourself.backend.auth.UserRole;
import com.getyourself.backend.common.ApiException;
import com.getyourself.backend.common.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/**
 * 微信登录控制器
 * 
 * 复用现有项目的认证体系（Redis token + CurrentUser），
 * 只新增微信登录入口。
 * 
 * 流程：
 * 1. 小程序 wx.login() 获取 code
 * 2. 前端将 code 发送到 /api/auth/wechat-login
 * 3. 后端用 code 调用微信 code2session 换取 openid
 * 4. 根据 openid 查找或创建用户
 * 5. 生成 token 存入 Redis（复用现有 AuthService 的模式）
 * 6. 返回 token + 用户信息
 */
@RestController
@RequestMapping("/api/auth")
public class WechatAuthController {
    private static final String SESSION_PREFIX = "auth:session:";
    private static final Duration SESSION_TTL = Duration.ofDays(7);

    private final WechatService wechatService;
    private final UserRepository userRepository;
    private final StringRedisTemplate redisTemplate;
    private final CurrentUser currentUser;

    public WechatAuthController(WechatService wechatService,
                                 UserRepository userRepository,
                                 StringRedisTemplate redisTemplate,
                                 CurrentUser currentUser) {
        this.wechatService = wechatService;
        this.userRepository = userRepository;
        this.redisTemplate = redisTemplate;
        this.currentUser = currentUser;
    }

    // ========== 请求/响应 DTO ==========

    public record WechatLoginRequest(@NotBlank String code) {}

    public record WechatLoginResponse(
            String token,
            Instant expiresAt,
            boolean isNewUser,
            UserResponse user
    ) {}

    public record UpdateProfileRequest(
            String nickname,
            String avatarUrl,
            String school,
            String major
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
        public static UserResponse from(UserEntity entity) {
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

    // ========== 接口实现 ==========

    /**
     * 微信登录 — 核心接口
     * 
     * 复用现有项目的 token 生成和 Redis 存储模式，
     * 与 AuthService.issueToken() 保持一致。
     */
    @PostMapping("/wechat-login")
    @Transactional
    public WechatLoginResponse wechatLogin(@Valid @RequestBody WechatLoginRequest request) {
        // 1. 调用微信 code2session
        WechatService.WechatLoginResult wxResult = wechatService.code2session(request.code());
        if (!wxResult.success()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "微信登录失败: " + wxResult.errorMessage());
        }

        String openid = wxResult.openid();

        // 2. 查找或创建用户（复用现有 UserEntity 结构）
        boolean isNewUser = false;
        UserEntity user = userRepository.findByOpenid(openid).orElse(null);

        if (user == null) {
            user = new UserEntity();
            user.setPublicUserId("wx-" + UUID.randomUUID().toString().replace("-", ""));
            user.setOpenid(openid);
            user.setUnionid(wxResult.unionid());
            user.setUsername("wx_" + openid.substring(0, Math.min(8, openid.length())));
            user.setEmail("wx_" + openid.substring(0, Math.min(8, openid.length())) + "@wx.placeholder");
            user.setPasswordHash("{wx}no-password"); // 微信用户无密码
            user.setRole(UserRole.STUDENT);
            user = userRepository.save(user);
            isNewUser = true;
        }

        // 3. 生成 token（与 AuthService.issueToken() 一致）
        String token = UUID.randomUUID().toString().replace("-", "")
                      + UUID.randomUUID().toString().replace("-", "");
        redisTemplate.opsForValue().set(SESSION_PREFIX + token, user.getPublicUserId(), SESSION_TTL);

        return new WechatLoginResponse(
                token,
                Instant.now().plus(SESSION_TTL),
                isNewUser,
                UserResponse.from(user)
        );
    }

    /**
     * 更新用户资料
     */
    @PutMapping("/profile")
    @Transactional
    public UserResponse updateProfile(@Valid @RequestBody UpdateProfileRequest request,
                                       HttpServletRequest httpRequest) {
        String userId = currentUser.id(httpRequest);
        UserEntity user = userRepository.findByPublicUserId(userId)
                .orElseThrow(() -> ApiException.notFound("用户不存在"));

        if (request.nickname() != null && !request.nickname().isBlank()) {
            user.setNickname(request.nickname().trim());
        }
        if (request.avatarUrl() != null) {
            user.setAvatarUrl(request.avatarUrl().trim());
        }
        if (request.school() != null) {
            user.setSchool(request.school().trim());
        }
        if (request.major() != null) {
            user.setMajor(request.major().trim());
        }

        userRepository.save(user);
        return UserResponse.from(user);
    }
}
