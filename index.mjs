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

function isPreferHandlingStrict({ prefer }, reply) {
  const { handling } = prefer?.match(/handling\s*=\s*(?<handling>[^,;\s"']+)/)?.groups ?? {};
  if (handling === 'strict' || handling === 'lenient')
    reply?.header('preference-applied', `handling=${handling}`);
  return handling !== 'lenient';
};

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

const createSendQuery = (queryTypes = defaultQueryTypes, strict) => async function sendQuery(data) {
  const { request: { body, headers, mediaType } } = this;
  if (!(mediaType in queryTypes)) {
    if (strict ?? isPreferHandlingStrict(headers, this))
      throw unsupportedMediaType(`${unsupportedMediaTypeMessage}; must be one of: ${Object.keys(queryTypes).join(', ')}`);
    return this.send(await data);
  }
  return this.send(await Promise.try(queryTypes[mediaType], await data, body).catch(cause => {
    const { message } = cause;
    throw Object.assign(badRequest(`${badRequestMessage}: ${message}`), { cause });
  }));
}

const createOnRouteHandler = ({
  advertiseAcceptQuery,
  baseMethod,
  excludeReply,
  excludeRequest,
  filterReply,
  filterRequest,
  queryTypes,
  sendQuery,
  strict,
}) => {
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
        const { body, headers, mediaType } = request;

        if (!(mediaType in queryTypes)) {
          if (strict ?? isPreferHandlingStrict(headers, reply))
            throw unsupportedMediaType(`${unsupportedMediaTypeMessage}; must be one of: ${acceptQuery}`);
          return handler.call(this, request, reply);
        }

        queryFnMap.set(request, (function(document) {
          return Promise.try(queryTypes[mediaType], document, this).catch(cause => {
            const { message } = cause;
            throw Object.assign(badRequest(`${badRequestMessage}: ${message}`), { cause });
          });
        }).bind(body));

        return handler.call(this, request, reply);
      },
      method: 'QUERY',
      preSerialization: [
        ...preSerialization,
        async function fastifyQueryPreSerialization(request, reply, payload) {
          if (!filterReply(reply) || excludeReply(reply))
            return payload;
          const queryFn = queryFnMap.get(request);
          return queryFn ? queryFn(payload) : payload;
        },
      ],
      [kFastifyQueryRoute]: true,
      [kParentRoute]: new WeakRef(routeOptions),
    });
  };
};

async function fastifyQuery(fastify, opts) {
  const { addQueryTypes, decorateReply, overrideQueryTypes, strict } = (opts = {
    addQueryTypes: {},
    advertiseAcceptQuery: ['GET', 'HEAD', 'QUERY'],
    baseMethod: 'GET',
    decorateReply: false,
    excludeReply: () => false,
    excludeRequest: false,
    filterReply: ({ statusCode }) => 200 <= statusCode && statusCode < 300,
    filterRequest: true,
    overrideQueryTypes: defaultQueryTypes,
    ...opts,
  });
  const queryTypes = {
    ...overrideQueryTypes,
    ...addQueryTypes,
  };
  const sendQuery = createSendQuery(queryTypes, strict);

  Object.entries(queryTypes).forEach(([contentType, queryFn]) => {
    if (typeof queryFn !== 'function')
      throw new TypeError(`Query for content type ${contentType} must be a function`);
    if (fastify.hasContentTypeParser(contentType))
      return;
    fastify.addContentTypeParser(contentType, { parseAs: 'string' }, async (request, body) => body);
  });

  if (decorateReply)
    fastify.decorateReply('sendQuery', sendQuery);

  fastify.addHook('onRoute', createOnRouteHandler(Object.assign(opts, { queryTypes, sendQuery })));
}

export default fp(fastifyQuery, {
  fastify: '5.x',
  name: 'fastify-query',
});

export {
  defaultQueryTypes,
  fastifyQuery,
};
