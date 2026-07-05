package com.getyourself.backend.wechat;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "wechat")
public class WechatConfig {
    private String appId;
    private String secret;
    private String subscribeTemplateId;

    public String getAppId() { return appId; }
    public void setAppId(String appId) { this.appId = appId; }
    public String getSecret() { return secret; }
    public void setSecret(String secret) { this.secret = secret; }
    public String getSubscribeTemplateId() { return subscribeTemplateId; }
    public void setSubscribeTemplateId(String subscribeTemplateId) { this.subscribeTemplateId = subscribeTemplateId; }
}
