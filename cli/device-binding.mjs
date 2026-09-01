import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { hostname } from 'node:os';
import process from 'node:process';

import { getCareerOpsRoot } from './path-resolver.mjs';

export const DEFAULT_DEVICE_SERVER_URL = 'http://localhost:8080';
const BINDING_CODE_PATTERN = /^GY-[A-Z0-9]{4}(?:-[A-Z0-9]{4}){1,2}$/;
const INSTALLATION_FILE = 'device-installation.json';
const BINDING_FILE = 'device-binding.json';

export class DeviceBindingError extends Error {
  constructor(message, { status, details } = {}) {
    super(message);
    this.name = 'DeviceBindingError';
    this.status = status;
    this.details = details;
  }
}

function installationPath(root) {
  return join(root, 'data', INSTALLATION_FILE);
}

function bindingPath(root) {
  return join(root, 'data', BINDING_FILE);
}

function readJsonObject(path, label) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw new DeviceBindingError(`无法读取${label}：${error.message}`);
  }

  try {
    const value = JSON.parse(raw);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('JSON root is not an object');
    }
    return value;
  } catch (error) {
    throw new DeviceBindingError(`${label}无效：${error.message}`);
  }
}

function readInstallation(root) {
  const value = readJsonObject(installationPath(root), '设备安装标识');
  if (value === undefined) return { state: 'missing' };
  if (typeof value.installId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(value.installId)) {
    return { state: 'invalid' };
  }
  return { state: 'ready', installId: value.installId };
}

function readBinding(root) {
  const value = readJsonObject(bindingPath(root), '设备绑定凭证');
  if (value === undefined) return { state: 'missing' };
  const validShape =
    typeof value.deviceToken === 'string' &&
    value.deviceToken.length >= 32 &&
    typeof value.deviceId === 'number' &&
    Number.isInteger(value.deviceId) &&
    typeof value.deviceName === 'string' &&
    typeof value.serverUrl === 'string' &&
    typeof value.boundAt === 'string';
  if (!validShape) return { state: 'invalid' };
  return {
    state: 'ready',
    deviceToken: value.deviceToken,
    deviceId: value.deviceId,
    deviceName: value.deviceName,
    serverUrl: value.serverUrl,
    boundAt: value.boundAt
  };
}

export function inspectDeviceBinding(root = getCareerOpsRoot()) {
  const installation = readInstallation(root);
  const binding = readBinding(root);
  const installationView = { state: installation.state };
  if (binding.state === 'ready') {
    return {
      state: 'ready',
      installation: installationView,
      device: {
        deviceId: binding.deviceId,
        deviceName: binding.deviceName,
        serverUrl: binding.serverUrl,
        boundAt: binding.boundAt
      }
    };
  }
  return {
    state: binding.state,
    installation: installationView,
    device: null
  };
}

function normalizeServerUrl(value) {
  const text = (value ?? process.env.GET_YOURSELF_API_URL ?? DEFAULT_DEVICE_SERVER_URL).trim().replace(/\/+$/, '');
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('only http/https is supported');
    return url.toString().replace(/\/+$/, '');
  } catch (error) {
    throw new DeviceBindingError(`服务地址无效：${text}`);
  }
}

async function requestDeviceApi(fetchImpl, serverUrl, path, options = {}) {
  let response;
  try {
    response = await fetchImpl(`${serverUrl}${path}`, options);
  } catch (error) {
    throw new DeviceBindingError(`无法连接 Get Yourself 服务：${error.message}`);
  }

  const contentType = response.headers?.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && typeof body.message === 'string'
        ? body.message
        : `请求失败（HTTP ${response.status}）`;
    throw new DeviceBindingError(message, { status: response.status, details: body });
  }
  return body;
}

function writeJsonAtomically(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  );
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
}

function newInstallId() {
  return randomBytes(32).toString('base64url');
}

function defaultDeviceName() {
  const name = hostname().replace(/[\r\n\t]/g, ' ').trim() || '本机工作台';
  return name.length <= 80 ? name : name.slice(0, 80);
}

export async function connectDevice({
  bindingCode,
  serverUrl,
  deviceName = defaultDeviceName(),
  replace = false,
  root = getCareerOpsRoot(),
  fetchImpl = fetch
} = {}) {
  const code = String(bindingCode ?? '').trim().toUpperCase();
  if (!BINDING_CODE_PATTERN.test(code)) {
    throw new DeviceBindingError('绑定码格式无效，示例：GY-ABCD-2345');
  }

  const installation = readInstallation(root);
  if (installation.state === 'invalid') {
    throw new DeviceBindingError('设备安装标识无效，请先修复 data/device-installation.json 后重试');
  }

  const existingBinding = readBinding(root);
  if (existingBinding.state === 'invalid') {
    throw new DeviceBindingError('本地绑定凭证无效，请先修复 data/device-binding.json 后重试');
  }
  if (existingBinding.state === 'ready' && !replace) {
    throw new DeviceBindingError('本机已有绑定凭证；如确认替换，请加 --replace');
  }

  const normalizedServerUrl = normalizeServerUrl(serverUrl);
  const name = String(deviceName ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim() || defaultDeviceName();
  if (name.length > 80) throw new DeviceBindingError('设备名称不能超过 80 个字符');

  if (existingBinding.state === 'ready') {
    try {
      await requestDeviceApi(fetchImpl, existingBinding.serverUrl, '/api/workbench/devices/disconnect', {
        method: 'POST',
        headers: { 'X-Device-Token': existingBinding.deviceToken }
      });
    } catch (error) {
      if (error instanceof DeviceBindingError && error.status !== 400 && error.status !== 401 && error.status !== 404) {
        throw error;
      }
    }
  }

  const installId = installation.state === 'ready' ? installation.installId : newInstallId();
  const response = await requestDeviceApi(fetchImpl, normalizedServerUrl, '/api/workbench/devices/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceCode: code,
      deviceName: name,
      installId
    })
  });

  if (
    response === null ||
    typeof response !== 'object' ||
    typeof response.deviceId !== 'number' ||
    typeof response.deviceName !== 'string' ||
    typeof response.deviceToken !== 'string' ||
    typeof response.boundAt !== 'string'
  ) {
    throw new DeviceBindingError('服务返回的设备绑定结果无效');
  }

  writeJsonAtomically(installationPath(root), {
    installId,
    createdAt: new Date().toISOString()
  });
  writeJsonAtomically(bindingPath(root), {
    deviceId: response.deviceId,
    deviceName: response.deviceName,
    deviceToken: response.deviceToken,
    serverUrl: normalizedServerUrl,
    boundAt: response.boundAt
  });

  return {
    state: 'ready',
    deviceId: response.deviceId,
    deviceName: response.deviceName,
    serverUrl: normalizedServerUrl,
    boundAt: response.boundAt
  };
}

export async function disconnectDevice({
  root = getCareerOpsRoot(),
  fetchImpl = fetch
} = {}) {
  const binding = readBinding(root);
  if (binding.state === 'missing') {
    return { state: 'missing', deviceId: null, deviceName: null };
  }
  if (binding.state === 'invalid') {
    throw new DeviceBindingError('本地绑定凭证无效，无法安全解绑');
  }

  await requestDeviceApi(fetchImpl, binding.serverUrl, '/api/workbench/devices/disconnect', {
    method: 'POST',
    headers: { 'X-Device-Token': binding.deviceToken }
  });

  rmSync(bindingPath(root), { force: true });
  return {
    state: 'disconnected',
    deviceId: binding.deviceId,
    deviceName: binding.deviceName
  };
}
