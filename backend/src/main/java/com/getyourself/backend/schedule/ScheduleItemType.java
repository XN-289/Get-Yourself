package com.getyourself.backend.schedule;

import com.getyourself.backend.common.ApiException;

public enum ScheduleItemType {
    RESERVATION,
    CHALLENGE,
    AI_PLAN,
    CUSTOM;

    public static ScheduleItemType fromText(String value) {
        if (value == null || value.isBlank()) {
            return CUSTOM;
        }

        String normalized = value.trim().toUpperCase();
        for (ScheduleItemType type : values()) {
            if (type.name().equals(normalized)) {
                return type;
            }
        }

        throw ApiException.badRequest("Unsupported schedule item type: " + value);
    }
}
