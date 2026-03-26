import {
  defineEventHandler,
  createError,
  readBody,
  readRawBody,
  getCookie,
  setCookie,
  deleteCookie,
  getRouterParam,
  getQuery,
  getHeader,
  getRequestHeaders,
  setResponseHeaders,
  setResponseStatus,
} from 'h3'

const globals: Record<string, unknown> = {
  defineEventHandler,
  createError,
  readBody,
  readRawBody,
  getCookie,
  setCookie,
  deleteCookie,
  getRouterParam,
  getQuery,
  getHeader,
  getRequestHeaders,
  setResponseHeaders,
  setResponseStatus,
}

for (const [name, fn] of Object.entries(globals)) {
  ;(globalThis as Record<string, unknown>)[name] = fn
}
