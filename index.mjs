import fp from 'fastify-plugin';
import { errorCodes } from 'fastify';
import { query } from 'jsonpath-rfc9535';

const { FST_ERR_CTP_INVALID_MEDIA_TYPE } = errorCodes;

const createOnRouteHandler = ({
  queryFn = query,
}) => function fastifyQueryJsonpathOnRoute(route) {
  const { handler, method } = route;
  if (method !== 'GET')
    return;
  this.route({
    ...route,
    async handler(request, reply) {
      const { headers: { ['content-type']: contentType }, body } = request;
      if (contentType.split(';', 1)[0].trim().toLowerCase() !== 'application/jsonpath')
        throw FST_ERR_CTP_INVALID_MEDIA_TYPE();
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
