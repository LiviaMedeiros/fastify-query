# fastify-query-jsonpath

[![npm](https://img.shields.io/npm/v/fastify-query-jsonpath.svg)](https://www.npmjs.com/package/fastify-query-jsonpath)

A Fastify plugin that automatically adds [`QUERY` method](https://www.rfc-editor.org/rfc/rfc10008) handlers with [`JSONPath`](https://www.rfc-editor.org/rfc/rfc9535) filtering.

Its main purpose is to be a drop-in solution for servers that already serve large responses to `GET` requests and modern clients who only need specific parts of these responses.

Clients can send a JSONPath expression in the request body (using `Content-Type: application/jsonpath`) and receive a filtered version of the original response payload.

## Usage

```mjs
// server
import Fastify from 'fastify';
import fastifyQueryJsonpath from 'fastify-query-jsonpath';

const app = Fastify();

await app.register(fastifyQueryJsonpath); // this does the trick!

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
# request examle
curl -X QUERY -H 'Content-Type: application/jsonpath' -d '$[?@.role=="user"]' http://localhost:3000/users
```

```json
// response (prettified)
[
  { "id": 2, "name": "Bob", "role": "user" },
  { "id": 3, "name": "Carol", "role": "user" }
]
```

## Options

| Option                 | Type                                                                   | Default                         | Description                                                               |
|------------------------|------------------------------------------------------------------------|---------------------------------|---------------------------------------------------------------------------|
| `advertiseAcceptQuery` | `string[]`                                                             | `['GET', 'HEAD', 'QUERY']`      | HTTP methods on which the `Accept-Query` header should be set             |
| `baseMethod`           | `string`                                                               | `'GET'`                         | Original method implementing server logic for the route                   |
| `contentType`          | `string`                                                               | `'application/jsonpath'`        | Content type expected for QUERY requests and advertised in `Accept-Query` |
| `excludeReply`         | `(reply) => boolean`                                                   | `() => false`                   | Whether to not apply the JSONPath filter to the response payload          |
| `excludeRequest`       | `boolean \| string \| RegExp \| string[] \| Set \| (route) => boolean` | `false`                         | Excludes which routes receive a `QUERY` variant                           |
| `filterReply`          | `(reply) => boolean`                                                   | status code is 2xx              | Whether to apply the JSONPath filter to the response payload              |
| `filterRequest`        | `boolean \| string \| RegExp \| string[] \| Set \| (route) => boolean` | `true`                          | Filters which routes receive a `QUERY` variant                            |
| `queryFn`              | `(document, jsonpath) => nodelist`                                     | `query` from `jsonpath-rfc9535` | Function that evaluates JSONPath expression against the full response     |

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

## How it works

1. Registers a content-type parser for `application/jsonpath` (JSONPath expression is a string).
2. On every matching route:
   - Adds `Accept-Query` header.
   - Creates a sibling route with `QUERY` method that:
     - Invokes the original route handler.
     - Applies the JSONPath expression to result.
     - Serializes and returns filtered result as response.

## How it works internally

- `Accept-Query` is added using `onSend` hooks.
- New `QUERY` route is registered via `onRoute` hook.
- Filtering using JSONPath is done in `preSerialization` hook.
- By default, filtering is implemented using `jsonpath-rfc9535` package.

## Contributing

Contributions are welcome.

## License

Licensed under [MIT](./LICENSE).
