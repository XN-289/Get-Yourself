package com.getyourself.backend.workbench;

import com.getyourself.backend.common.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/workbench/devices")
public class WorkbenchDeviceController {
    private final WorkbenchDeviceService service;
    private final CurrentUser currentUser;

    public WorkbenchDeviceController(WorkbenchDeviceService service, CurrentUser currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @GetMapping
    public List<WorkbenchDeviceDtos.DeviceResponse> list(HttpServletRequest request) {
        return service.list(currentUser.id(request));
    }

    @PostMapping("/code")
    public WorkbenchDeviceDtos.CreateCodeResponse createCode(HttpServletRequest request) {
        return service.createCode(currentUser.id(request));
    }

    @PostMapping("/bind")
    public WorkbenchDeviceDtos.BindResponse bind(@Valid @RequestBody WorkbenchDeviceDtos.BindRequest request) {
        return service.bind(request);
    }

    @PostMapping("/status")
    public WorkbenchDeviceDtos.DeviceResponse status(
            @RequestHeader(value = "X-Device-Token", required = false) String deviceToken
    ) {
        return service.status(deviceToken);
    }

    @PostMapping("/disconnect")
    public void disconnect(
            @RequestHeader(value = "X-Device-Token", required = false) String deviceToken
    ) {
        service.disconnect(deviceToken);
    }

    @DeleteMapping("/{deviceId}")
    public void revoke(@PathVariable Long deviceId, HttpServletRequest request) {
        service.revoke(currentUser.id(request), deviceId);
    }
}
