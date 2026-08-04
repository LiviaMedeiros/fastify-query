import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import fastifyQuestJsonpath from '../index.mjs';

const createApp = async (opts = {}) => {
  const app = Fastify();
  await app.register(fastifyQuestJsonpath, opts);
  return app;
};

const query = (app, url, payload, headers = {}) => app.inject({
  method: 'QUERY',
  url,
  headers: { 'content-type': 'application/jsonpath', ...headers },
  payload,
});

test('queries array values', async (t) => {
  const app = await createApp();
  t.after(() => app.close());
  app.get('/users', async () => ({ users: [{ name: 'a' }, { name: 'b' }] }));
  await app.ready();
  const res = await query(app, '/users', '$.users[*].name');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), ['a', 'b']);
});

test('queries object members', async (t) => {
  const app = await createApp();
  t.after(() => app.close());
  app.get('/data', async () => ({ user: { id: 42, name: 'alice' } }));
  await app.ready();
  const res = await query(app, '/data', '$.user.id');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), [42]);
});

test('queries nested objects', async (t) => {
  const app = await createApp();
  t.after(() => app.close());
  app.get('/data', async () => ({ a: { b: { c: 123 } } }));
  await app.ready();
  const res = await query(app, '/data', '$.a.b.c');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), [123]);
});

test('queries recursive descent', async (t) => {
  const app = await createApp();
  t.after(() => app.close());
  app.get('/data', async () => ({ a: { id: 1 }, b: { id: 2 } }));
  await app.ready();
  const res = await query(app, '/data', '$..id');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), [1, 2]);
});

test('queries array indexes', async (t) => {
  const app = await createApp();
  t.after(() => app.close());
  app.get('/items', async () => ({ items: ['a', 'b', 'c'] }));
  await app.ready();
  const res = await query(app, '/items', '$.items[1]');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), ['b']);
});

test('queries missing values', async (t) => {
  const app = await createApp();
  t.after(() => app.close());
  app.get('/data', async () => ({ value: 1 }));
  await app.ready();
  const res = await query(app, '/data', '$.missing');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), []);
});

test('queries root document', async (t) => {
  const app = await createApp();
  t.after(() => app.close());
  app.get('/data', async () => ({ value: 1 }));
  await app.ready();
  const res = await query(app, '/data', '$');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), [{ value: 1 }]);
});

test('adds accept-query to advertised methods', async (t) => {
  const app = await createApp();
  t.after(() => app.close());
  app.get('/data', async () => ({ value: 1 }));
  await app.ready();
  const res = await app.inject({ method: 'GET', url: '/data' });
  assert.equal(res.headers['accept-query'], 'application/jsonpath');
});

test('does not advertise disabled methods', async (t) => {
  const app = await createApp({ advertiseAcceptQuery: [] });
  t.after(() => app.close());
  app.get('/data', async () => ({ value: 1 }));
  await app.ready();
  const res = await app.inject({ method: 'GET', url: '/data' });
  assert.equal(res.headers['accept-query'], undefined);
});

test('supports custom content type', async (t) => {
  const app = await createApp({ contentType: 'application/x-jsonpath' });
  t.after(() => app.close());
  app.get('/data', async () => ({ value: 1 }));
  await app.ready();
  const res = await app.inject({
    method: 'QUERY',
    url: '/data',
    headers: { 'content-type': 'application/x-jsonpath' },
    payload: '$.value',
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), [1]);
});

test('rejects wrong content type', async (t) => {
  const app = await createApp();
  t.after(() => app.close());
  app.get('/data', async () => ({ value: 1 }));
  await app.ready();
  const res = await app.inject({
    method: 'QUERY',
    url: '/data',
    headers: { 'content-type': 'text/plain' },
    payload: '$.value',
  });
  assert.equal(res.statusCode, 415);
  assert.equal(res.json().code, 'FST_ERR_CTP_INVALID_MEDIA_TYPE');
});

test('accepts content type parameters', async (t) => {
  const app = await createApp();
  t.after(() => app.close());
  app.get('/data', async () => ({ value: 1 }));
  await app.ready();
  const res = await app.inject({
    method: 'QUERY',
    url: '/data',
    headers: { 'content-type': 'application/jsonpath; charset=utf-8' },
    payload: '$.value',
  });
  assert.deepEqual(res.json(), [1]);
});

test('filterRequest function controls generated query routes', async (t) => {
  const app = await createApp({ filterRequest: ({ url }) => url === '/allowed' });
  t.after(() => app.close());
  app.get('/allowed', async () => ({ value: 1 }));
  app.get('/blocked', async () => ({ value: 2 }));
  await app.ready();
  assert.deepEqual((await query(app, '/allowed', '$.value')).json(), [1]);
  assert.equal((await query(app, '/blocked', '$.value')).statusCode, 404);
});

test('excludeRequest removes generated query routes', async (t) => {
  const app = await createApp({ excludeRequest: '/blocked' });
  t.after(() => app.close());
  app.get('/blocked', async () => ({ value: 1 }));
  app.get('/allowed', async () => ({ value: 2 }));
  await app.ready();
  assert.equal((await query(app, '/blocked', '$.value')).statusCode, 404);
  assert.deepEqual((await query(app, '/allowed', '$.value')).json(), [2]);
});

test('filterReply prevents serialization transformation', async (t) => {
  const app = await createApp({ filterReply: () => false });
  t.after(() => app.close());
  app.get('/data', async () => ({ value: 1 }));
  await app.ready();
  const res = await query(app, '/data', '$.value');
  assert.deepEqual(res.json(), { value: 1 });
});

test('excludeReply prevents serialization transformation', async (t) => {
  const app = await createApp({ excludeReply: () => true });
  t.after(() => app.close());
  app.get('/data', async () => ({ value: 1 }));
  await app.ready();
  const res = await query(app, '/data', '$.value');
  assert.deepEqual(res.json(), { value: 1 });
});
