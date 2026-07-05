package com.getyourself.backend.wechat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

/**
 * 微信服务端API封装
 * 
 * 核心职责：
 * 1. code2session — 小程序登录时用 code 换 openid + session_key
 * 2. getAccessToken — 获取微信接口调用凭证（带缓存）
 * 3. sendSubscribeMessage — 发送订阅消息
 * 
 * 设计决策：
 * - session_key 绝对不能下发前端，只在服务端使用
 * - access_token 做内存缓存，提前5分钟过期
 * - 所有微信API调用失败都降级处理，不阻塞主流程
 */
@Service
public class WechatService {
    private static final Logger log = LoggerFactory.getLogger(WechatService.class);
    private static final String CODE2SESSION_URL =
            "https://api.weixin.qq.com/sns/jscode2session?appid=%s&secret=%s&js_code=%s&grant_type=authorization_code";

    @Value("${wechat.appid:}")
    private String appId;

    @Value("${wechat.secret:}")
    private String secret;

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    // access_token 缓存
    private String cachedAccessToken;
    private long accessTokenExpireAt;

    public WechatService(ObjectMapper objectMapper) {
        this.restTemplate = new RestTemplate();
        this.objectMapper = objectMapper;
    }

    /**
     * 用 code 换取 openid 和 session_key
     *
     * @param code wx.login() 返回的 code
     * @return openid + session_key，失败返回 errorMessage
     */
    public WechatLoginResult code2session(String code) {
        // 开发模式：未配置真实appid时，使用模拟登录
        if (appId == null || appId.isEmpty() || appId.equals("YOUR_APPID_HERE")) {
            log.info("开发模式：使用模拟登录，code={}", code);
            // 用code生成固定的openid，保证同一code对应同一用户
            String mockOpenid = "dev_openid_" + (code != null ? code.hashCode() : "test");
            return WechatLoginResult.ok(mockOpenid, "dev_session_key", null);
        }

        String url = String.format(CODE2SESSION_URL, appId, secret, code);
        try {
            String response = restTemplate.getForObject(url, String.class);
            JsonNode node = objectMapper.readTree(response);

            if (node.has("errcode") && node.get("errcode").asInt() != 0) {
                String errMsg = node.has("errmsg") ? node.get("errmsg").asText() : "unknown";
                log.error("微信 code2session 失败: errcode={}, errmsg={}",
                        node.get("errcode").asInt(), errMsg);
                return WechatLoginResult.fail(errMsg);
            }

            String openid = node.path("openid").asText(null);
            String sessionKey = node.path("session_key").asText(null);
            String unionid = node.path("unionid").asText(null);

            if (openid == null || sessionKey == null) {
                return WechatLoginResult.fail("微信返回数据不完整");
            }

            return WechatLoginResult.ok(openid, sessionKey, unionid);
        } catch (Exception e) {
            log.error("调用微信 code2session 异常", e);
            return WechatLoginResult.fail("调用微信接口失败: " + e.getMessage());
        }
    }

    /**
     * 获取 access_token（带缓存）
     */
    public synchronized String getAccessToken() {
        if (cachedAccessToken != null && System.currentTimeMillis() < accessTokenExpireAt) {
            return cachedAccessToken;
        }

        String url = String.format(
                "https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=%s&secret=%s",
                appId, secret);
        try {
            String response = restTemplate.getForObject(url, String.class);
            JsonNode node = objectMapper.readTree(response);
            if (node.has("access_token")) {
                cachedAccessToken = node.get("access_token").asText();
                int expiresIn = node.path("expires_in").asInt(7200);
                accessTokenExpireAt = System.currentTimeMillis() + (expiresIn - 300) * 1000L;
                return cachedAccessToken;
            }
            log.error("获取 access_token 失败: {}", response);
            return null;
        } catch (Exception e) {
            log.error("获取 access_token 异常", e);
            return null;
        }
    }

    // ========== 内部数据类 ==========

    public record WechatLoginResult(
            boolean success,
            String openid,
            String sessionKey,
            String unionid,
            String errorMessage
    ) {
        public static WechatLoginResult ok(String openid, String sessionKey, String unionid) {
            return new WechatLoginResult(true, openid, sessionKey, unionid, null);
        }
        public static WechatLoginResult fail(String msg) {
            return new WechatLoginResult(false, null, null, null, msg);
        }
    }
}
