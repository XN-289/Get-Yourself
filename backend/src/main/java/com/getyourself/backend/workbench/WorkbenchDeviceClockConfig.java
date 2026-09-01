package com.getyourself.backend.workbench;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
public class WorkbenchDeviceClockConfig {
    @Bean
    Clock workbenchDeviceClock() {
        return Clock.systemUTC();
    }
}
