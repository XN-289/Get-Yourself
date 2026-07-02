package com.getyourself.backend.mq;

public enum DomainEventOutboxStatus {
    PENDING,
    FAILED,
    SENT
}
