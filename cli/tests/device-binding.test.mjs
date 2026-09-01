import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  connectDevice,
  disconnectDevice,
  inspectDeviceBinding
} from '../device-binding.mjs';
import { parseConnectArguments, parseDisconnectArguments } from '../gy.mjs';

function temporaryRoot() {
  return mkdtempSync(join(tmpdir(), 'gy-device-binding-'));
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body
  };
}

function emptyResponse(status = 204) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'text/plain' }),
    text: async () => ''
  };
}

function seedInstallation(root, installId = 'install-stable-value-001') {
  mkdirSync(join(root, 'data'), { recursive: true });
  writeFileSync(join(root, 'data', 'device-installation.json'), `${JSON.stringify({ installId })}\n`);
}

function seedBinding(root, token = 'old-device-token-0000000000000000000000') {
  mkdirSync(join(root, 'data'), { recursive: true });
  writeFileSync(
    join(root, 'data', 'device-binding.json'),
    `${JSON.stringify({
      deviceId: 12,
      deviceName: '旧工位',
      deviceToken: token,
      serverUrl: 'http://127.0.0.1:18080',
      boundAt: '2026-09-01T10:00:00Z'
    })}\n`
  );
}

test('device binding inspection is read-only when files are missing', () => {
  const root = temporaryRoot();
  try {
    const inspection = inspectDeviceBinding(root);
    assert.equal(inspection.state, 'missing');
    assert.equal(inspection.installation.state, 'missing');
    assert.deepEqual(readdirSync(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('connect writes a stable installation id and one-time local credential', async () => {
  const root = temporaryRoot();
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({
      deviceId: 21,
      deviceName: '本机工作台',
      deviceToken: 'new-secret-device-token-000000000000000',
      boundAt: '2026-09-01T11:00:00Z'
    });
  };

  try {
    const result = await connectDevice({
      bindingCode: 'gy-abcd-2345',
      serverUrl: 'http://127.0.0.1:18080/',
      deviceName: '本机工作台',
      root,
      fetchImpl
    });

    assert.equal(result.state, 'ready');
    assert.equal(JSON.stringify(result).includes('new-secret-device-token'), false);
    assert.equal(calls[0].url, 'http://127.0.0.1:18080/api/workbench/devices/bind');
    assert.equal(JSON.parse(calls[0].options.body).deviceCode, 'GY-ABCD-2345');

    const installation = JSON.parse(readFileSync(join(root, 'data', 'device-installation.json'), 'utf8'));
    const binding = JSON.parse(readFileSync(join(root, 'data', 'device-binding.json'), 'utf8'));
    assert.match(installation.installId, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(binding.deviceToken, 'new-secret-device-token-000000000000000');
    assert.equal(binding.serverUrl, 'http://127.0.0.1:18080');
    assert.equal(inspectDeviceBinding(root).device.deviceName, '本机工作台');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('connect refuses to overwrite an existing binding without replace', async () => {
  const root = temporaryRoot();
  seedInstallation(root);
  seedBinding(root);
  let called = false;

  try {
    await assert.rejects(
      connectDevice({
        bindingCode: 'GY-ABCD-2345',
        root,
        fetchImpl: async () => {
          called = true;
          return jsonResponse({});
        }
      }),
      /已有绑定凭证/
    );
    assert.equal(called, false);
    assert.equal(JSON.parse(readFileSync(join(root, 'data', 'device-binding.json'), 'utf8')).deviceName, '旧工位');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('connect with replace disconnects the old credential before binding', async () => {
  const root = temporaryRoot();
  seedInstallation(root);
  seedBinding(root);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/disconnect')) return emptyResponse();
    return jsonResponse({
      deviceId: 22,
      deviceName: '新工位',
      deviceToken: 'replacement-secret-token-000000000000000',
      boundAt: '2026-09-01T12:00:00Z'
    });
  };

  try {
    const result = await connectDevice({
      bindingCode: 'GY-ABCD-2345',
      serverUrl: 'http://127.0.0.1:18080',
      root,
      replace: true,
      fetchImpl
    });

    assert.equal(result.deviceName, '新工位');
    assert.equal(calls.map((call) => call.url).at(-1), 'http://127.0.0.1:18080/api/workbench/devices/bind');
    assert.deepEqual(calls.map((call) => call.options.method), ['POST', 'POST']);
    assert.equal(JSON.parse(readFileSync(join(root, 'data', 'device-binding.json'), 'utf8')).deviceId, 22);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('disconnect sends the device token and removes the local credential after success', async () => {
  const root = temporaryRoot();
  seedInstallation(root);
  seedBinding(root, 'disconnect-secret-token-000000000000000000');
  const calls = [];

  try {
    const result = await disconnectDevice({
      root,
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return emptyResponse();
      }
    });

    assert.deepEqual(result, { state: 'disconnected', deviceId: 12, deviceName: '旧工位' });
    assert.equal(calls[0].options.headers['X-Device-Token'], 'disconnect-secret-token-000000000000000000');
    assert.equal(inspectDeviceBinding(root).state, 'missing');
    assert.equal(JSON.stringify(result).includes('disconnect-secret-token'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('connect and disconnect command arguments are parsed explicitly', () => {
  assert.deepEqual(
    parseConnectArguments([
      'node',
      'gy.mjs',
      'connect',
      'GY-ABCD-2345',
      '--server',
      'http://127.0.0.1:18080',
      '--device-name=本机工作台',
      '--replace',
      '--json'
    ]),
    {
      command: 'connect',
      json: true,
      replace: true,
      serverUrl: 'http://127.0.0.1:18080',
      deviceName: '本机工作台',
      bindingCode: 'GY-ABCD-2345'
    }
  );
  assert.deepEqual(parseDisconnectArguments(['node', 'gy.mjs', 'disconnect', '--json']), {
    command: 'disconnect',
    json: true
  });
  assert.match(parseConnectArguments(['node', 'gy.mjs', 'connect']).error, /exactly one binding code/);
  assert.deepEqual(parseConnectArguments(['node', 'gy.mjs', 'connect', 'GY-ABCD-2345']), {
    command: 'connect',
    json: false,
    replace: false,
    serverUrl: undefined,
    deviceName: undefined,
    bindingCode: 'GY-ABCD-2345'
  });
  assert.match(parseDisconnectArguments(['node', 'gy.mjs', 'disconnect', '--bogus']).error, /unrecognized argument/);
});
