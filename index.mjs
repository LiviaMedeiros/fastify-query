import fp from 'fastify-plugin';
import { httpErrors } from '@fastify/sensible';
import { query as queryJsonpath } from 'jsonpath-rfc9535';
import { get as queryJsonpointer } from 'jsonpointer';

const { badRequest, unsupportedMediaType } = httpErrors;
const { message: badRequestMessage } = badRequest();
const { message: unsupportedMediaTypeMessage } = unsupportedMediaType();

const kFastifyQueryRoute = Symbol('fastify-query-route');
const kParentRoute = Symbol('parent-route');
const queryFnMap = new WeakMap();

const defaultQueryTypes = Object.freeze({
  'application/jsonpath': queryJsonpath,
  'application/jsonpointer': queryJsonpointer,
});

function routeMatch(route) {
  const { url } = route;
  switch (typeof this) {
    case 'function': return this(route);
    case 'boolean':
    case 'number':
    case 'bigint': return this;
    case 'string': return this === url;
    case 'object': switch (true) {
      case this instanceof Set: return this.has(url);
      case Array.isArray(this): return this.includes(url);
      case this instanceof RegExp: return this.test(url);
      default:
    }
    default: return true;
  }
}

const getContentType = ({ ['content-type']: requestContentType }) => requestContentType.split(';', 1)[0].trim().toLowerCase();


const createOnRouteHandler = ({
  addQueryTypes,
  advertiseAcceptQuery,
  baseMethod,
  excludeReply,
  excludeRequest,
  filterReply,
  filterRequest,
  overrideQueryTypes,
}) => {
  const queryTypes = { ...overrideQueryTypes, ...addQueryTypes };
  const acceptQuery = Object.keys(queryTypes).join(', ');

  return function fastifyQueryOnRoute(routeOptions) {
    if (routeOptions[kFastifyQueryRoute] ||
        !routeMatch.call(filterRequest, routeOptions) ||
        routeMatch.call(excludeRequest, routeOptions))
      return;

    const { handler, method, onSend, preSerialization = [] } = routeOptions;

    if (advertiseAcceptQuery?.includes(method)) {
      async function fastifyQueryOnSend(request, reply, payload) {
        reply.header('accept-query', acceptQuery);
        return payload;
      };
      Array.isArray(onSend)
        ? onSend.push(fastifyQueryOnSend)
        : (routeOptions.onSend = onSend ? [onSend, fastifyQueryOnSend] : fastifyQueryOnSend);
    }

    method === baseMethod && this.route({
      ...routeOptions,
      async handler(request, reply) {
        const { body, headers } = request;
        const queryFn = queryTypes[getContentType(headers)];

        if (!queryFn)
          throw unsupportedMediaType(`${unsupportedMediaTypeMessage}; must be one of: ${acceptQuery}`);

        queryFnMap.set(request, (function(document) {
          try {
            return queryFn(document, this);
          } catch (cause) {
            const { message } = cause;
            throw Object.assign(badRequest(`${badRequestMessage}: ${message}`), { cause });
          }
        }).bind(body));

        return handler.call(this, request, reply);
      },
      method: 'QUERY',
      preSerialization: [
        ...preSerialization,
        async (request, reply, payload) => filterReply(reply) && !excludeReply(reply) ? queryFnMap.get(request)(payload) : payload,
      ],
      [kFastifyQueryRoute]: true,
      [kParentRoute]: routeOptions,
    });
  };
};

async function fastifyQuery(fastify, opts) {
  const { overrideQueryTypes, addQueryTypes } = (opts = {
    addQueryTypes: {},
    advertiseAcceptQuery: ['GET', 'HEAD', 'QUERY'],
    baseMethod: 'GET',
    excludeReply: () => false,
    excludeRequest: false,
    filterReply: ({ statusCode }) => 200 <= statusCode && statusCode < 300,
    filterRequest: true,
    overrideQueryTypes: defaultQueryTypes,
    ...opts,
  });

  Object.keys({
    ...overrideQueryTypes,
    ...addQueryTypes,
  }).forEach(contentType => fastify.hasContentTypeParser(contentType) || fastify.addContentTypeParser(contentType, { parseAs: 'string' }, async (request, body) => body));
  fastify.addHook('onRoute', createOnRouteHandler(opts));
}

export default fp(fastifyQuery, {
  fastify: '5.x',
  name: 'fastify-query',
});

export {
  defaultQueryTypes,
  fastifyQuery,
};
