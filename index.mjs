import fp from 'fastify-plugin';
import { errorCodes } from 'fastify';
import { query } from 'jsonpath-rfc9535';

const { FST_ERR_CTP_INVALID_MEDIA_TYPE } = errorCodes;

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
};

const createOnRouteHandler = ({
  addAcceptQuery = true,
  contentType = 'application/jsonpath',
  queryFn = query,
  filter = ({ method }) => method === 'GET',
}) => function fastifyQueryJsonpathOnRoute(route) {
  const { handler, method } = route;
  if (!routeMatch.call(filter, route))
    return;
  this.route({
    ...route,
    async handler(request, reply) {
      const { headers: { ['content-type']: requestContentType }, body } = request;
      if (requestContentType.split(';', 1)[0].trim().toLowerCase() !== contentType)
        throw FST_ERR_CTP_INVALID_MEDIA_TYPE();
      if (addAcceptQuery)
        reply.header('accept-query', contentType);
      return queryFn(await handler.call(this, request, reply), body);
    },
    method: 'QUERY',
  });
};

export default fp(async (fastify, options) => {
  fastify
    .addContentTypeParser('application/jsonpath', { parseAs: 'string' }, async (request, body) => body)
    .addHook('onRoute', createOnRouteHandler(options));
}, {
  fastify: '5.x',
  name: 'fastify-query-jsonpath',
});
