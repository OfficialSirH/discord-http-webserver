import { beforeEach, expect, test } from 'vitest';
import { Client } from '../src/structures/Client.js';
import { loadTestRouter } from './utils.js';

let client: Client;

beforeEach(() => {
  client = new Client('REAL-TOKEN', 'REAL-APPLICATION-ID', 'REAL-PUBLIC-KEY');
});

test('default Client params', () => {
  expect(client.applicationId).toBe('REAL-APPLICATION-ID');
  expect(client.publicKey).toBe('REAL-PUBLIC-KEY');
  expect(client.route).toBe('/interactions');
  expect(client.logger).toBeDefined();
  expect(client.port).toBe(3000);
  expect(client.rest).toBeDefined();
  expect(client.api).toBeDefined();
  expect(client.server).toBeDefined();
});

test('invalid signature on Client server', async () => {
  await client.loadRouter();

  const response = await client.server.inject({
    method: 'POST',
    url: '/interactions',
    headers: {
      'x-signature-ed25519': 'INVALID-SIGNATURE',
      'x-signature-timestamp': 'INVALID-TIMESTAMP',
    },
    body: {
      type: 1,
    },
  });

  expect(response.statusCode).toBe(500);
  expect(response.json()).toEqual({ statusCode: 500, error: 'Internal Server Error', message: 'bad signature size' });

  await client.server.close();
});

test('ping interaction', async () => {
  await loadTestRouter(client);

  const response = await client.server.inject({
    method: 'POST',
    url: '/interactions',
    body: {
      type: 1,
    },
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ type: 1 });
});
