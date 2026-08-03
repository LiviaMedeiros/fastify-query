import fp from 'fastify-plugin';
import { errorCodes } from 'fastify';
import { query } from 'jsonpath-rfc9535';

const { FST_ERR_CTP_INVALID_MEDIA_TYPE } = errorCodes;

const kParentRoute = Symbol('parent-route');

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

const createOnRouteHandler = ({
  advertiseAcceptQuery,
  baseMethod,
  contentType,
  filterReply,
  filterRequest,
  queryFn,
}) => function fastifyQueryJsonpathOnRoute(routeOptions) {
  if (!routeMatch.call(filterRequest, routeOptions))
    return;

  const { handler, method, onSend, preSerialization = [] } = routeOptions;

  if (advertiseAcceptQuery?.includes(method)) {
    async function fastifyQueryJsonpathOnSend(request, reply, payload) {
      reply.header('accept-query', contentType);
      return payload;
    };
    Array.isArray(onSend)
      ? onSend.push(fastifyQueryJsonpathOnSend)
      : (routeOptions.onSend = onSend ? [onSend, fastifyQueryJsonpathOnSend] : fastifyQueryJsonpathOnSend);
  }

  method === baseMethod && this.route({
    ...routeOptions,
    async handler(request, reply) {
      const { headers: { ['content-type']: requestContentType } } = request;
      if (requestContentType.split(';', 1)[0].trim().toLowerCase() !== contentType)
        throw FST_ERR_CTP_INVALID_MEDIA_TYPE();
      return handler.call(this, request, reply);
    },
    [kParentRoute]: routeOptions,
    preSerialization: [
      ...preSerialization,
      async ({ body }, reply, payload) => filterReply(reply) ? queryFn(payload, body) : payload,
    ],
    method: 'QUERY',
  });
};

export default fp(async (fastify, opts) => {
  const { contentType } = (opts = {
    advertiseAcceptQuery: ['GET', 'HEAD', 'QUERY'],
    baseMethod: 'GET',
    contentType: 'application/jsonpath',
    filterReply: ({ statusCode }) => 200 <= statusCode && statusCode < 300,
    filterRequest: true,
    queryFn: query,
    ...opts,
  });
  fastify
    .addContentTypeParser(contentType, { parseAs: 'string' }, async (request, body) => body)
    .addHook('onRoute', createOnRouteHandler(opts));
}, {
  fastify: '5.x',
  name: 'fastify-query-jsonpath',
});
