CREATE TABLE workbench_devices (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    device_name VARCHAR(80) NOT NULL,
    install_id_hash CHAR(64) NOT NULL,
    code_hash CHAR(64) NULL,
    device_token_hash CHAR(64) NULL,
    status VARCHAR(20) NOT NULL,
    expires_at TIMESTAMP(6) NULL,
    bound_at TIMESTAMP(6) NULL,
    last_active_at TIMESTAMP(6) NULL,
    revoked_at TIMESTAMP(6) NULL,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT uk_workbench_devices_code UNIQUE (code_hash),
    CONSTRAINT uk_workbench_devices_token UNIQUE (device_token_hash),
    CONSTRAINT ck_workbench_devices_status CHECK (status IN ('pending', 'active', 'revoked', 'expired'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_workbench_devices_user_status ON workbench_devices(user_id, status, created_at);
CREATE INDEX idx_workbench_devices_install ON workbench_devices(user_id, install_id_hash, status);
