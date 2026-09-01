import { api } from "@/api/client";

export interface WorkbenchDevice {
  id: number;
  deviceName: string;
  status: "pending" | "active" | "expired";
  expiresAt: string | null;
  boundAt: string | null;
  lastActiveAt: string | null;
  createdAt: string;
}

export interface WorkbenchDeviceCode {
  id: number;
  deviceCode: string;
  expiresAt: string;
}

export const workbenchDeviceApi = {
  list() {
    return api.get<WorkbenchDevice[]>("/api/workbench/devices");
  },
  createCode() {
    return api.post<WorkbenchDeviceCode>("/api/workbench/devices/code");
  },
  unbind(deviceId: number) {
    return api.delete<void>(`/api/workbench/devices/${deviceId}`);
  }
};
