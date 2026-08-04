# fastify-query

[![npm](https://img.shields.io/npm/v/fastify-query.svg)](https://www.npmjs.com/package/fastify-query)

A Fastify plugin that automatically adds [`QUERY` method](https://www.rfc-editor.org/rfc/rfc10008) handlers with [`JSONPath`](https://www.rfc-editor.org/rfc/rfc9535) and [`JSON Pointer`](https://www.rfc-editor.org/rfc/rfc6901) filtering.

Its main purpose is to be a drop-in solution for servers that already serve large responses to `GET` requests and modern clients who only need specific parts of these responses.

Clients can send a query expression in the request body (using `Content-Type: application/jsonpath` or `application/jsonpointer`) and receive a filtered version of the original response payload.

## Usage

```mjs
// server
import Fastify from 'fastify';
import fastifyQuery from 'fastify-query';

const app = Fastify();

await app.register(fastifyQuery); // this does the trick!

app.get('/users', async () => {
  return [
    { id: 1, name: 'Alice', role: 'admin' },
    { id: 2, name: 'Bob', role: 'user' },
    { id: 3, name: 'Carol', role: 'user' },
  ];
});

await app.listen({ port: 3000 });
```

```console
# request example (JSONPath)
curl -X QUERY -H 'Content-Type: application/jsonpath' -d '$[?@.role=="user"]' http://localhost:3000/users
```

```json
// response (prettified)
[
  { "id": 2, "name": "Bob", "role": "user" },
  { "id": 3, "name": "Carol", "role": "user" }
]
```

```console
# request example (JSON Pointer)
curl -X QUERY -H 'Content-Type: application/jsonpointer' -d '/1/name' http://localhost:3000/users
```

```json
// response
"Bob"
```

## Options

| Option                 | Type                                                                   | Default                    | Description                                                                  |
|------------------------|------------------------------------------------------------------------|----------------------------|------------------------------------------------------------------------------|
| `advertiseAcceptQuery` | `string[]`                                                             | `['GET', 'HEAD', 'QUERY']` | HTTP methods on which the `Accept-Query` header should be set                |
| `addQueryTypes`        | `Record<string, (document, query) => value>`                           | `{}`                       | Additional query types to merge on top of defaults (or `overrideQueryTypes`) |
| `baseMethod`           | `string`                                                               | `'GET'`                    | Original method implementing server logic for the route                      |
| `excludeReply`         | `(reply) => boolean`                                                   | `() => false`              | Whether to not apply the query filter to the response payload                |
| `excludeRequest`       | `boolean \| string \| RegExp \| string[] \| Set \| (route) => boolean` | `false`                    | Excludes which routes receive a `QUERY` variant                              |
| `filterReply`          | `(reply) => boolean`                                                   | status code is 2xx         | Whether to apply the query filter to the response payload                    |
| `filterRequest`        | `boolean \| string \| RegExp \| string[] \| Set \| (route) => boolean` | `true`                     | Filters which routes receive a `QUERY` variant                               |
| `overrideQueryTypes`   | `Record<string, (document, query) => value>`                           | `defaultQueryTypes`        | Replaces the default query types entirely                                    |

### Default query types

The plugin exports `defaultQueryTypes`:

```mjs
import { defaultQueryTypes } from 'fastify-query';

// {
//   'application/jsonpath': queryJsonpath,       // `query` from jsonpath-rfc9535
//   'application/jsonpointer': queryJsonpointer, // `get` from jsonpointer
// }
```

Keys become the accepted `Content-Type` values (and are advertised in `Accept-Query`). Values are the functions that evaluate the query expression against the full response.

### `filterRequest` examples

```js
// All routes (default)
filterRequest: true

// Exact URL
filterRequest: '/users'

// Multiple URLs
filterRequest: ['/users', '/posts']

// Regular expression
filterRequest: /^\/api\//

// Custom function
filterRequest: ({ url }) => url.startsWith('/api') || url.endsWith('.json')
```

### Custom query types examples

```js
import fastifyQuery, { defaultQueryTypes } from 'fastify-query';

// Add a custom content type alongside the defaults
await app.register(fastifyQuery, {
  addQueryTypes: {
    'application/x-jsonpath': defaultQueryTypes['application/jsonpath'],
  },
});

// Replace defaults entirely
await app.register(fastifyQuery, {
  overrideQueryTypes: {
    'application/xpath': (document, query) => {
      // your implementation
    },
  },
});
```

## How it works

1. Registers content-type parsers for each configured query type (query expression is a string).
2. On every matching route:
   - Adds `Accept-Query` header listing the supported query content types.
   - Creates a sibling route with `QUERY` method that:
     - Invokes the original route handler.
     - Applies the query expression (based on `Content-Type`) to the result.
     - Serializes and returns the filtered result as response.

## How it works internally

- `Accept-Query` is added using `onSend` hooks.
- New `QUERY` route is registered via `onRoute` hook.
- Filtering is done in `preSerialization` hook using the query function matched by the request's `Content-Type`.
- By default, JSONPath filtering uses the `jsonpath-rfc9535` package.
- By default, JSON Pointer filtering uses the `jsonpointer` package.

## Contributing

Contributions are welcome.

## License

Licensed under [MIT](./LICENSE).
