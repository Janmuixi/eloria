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
  setHeader,
  setResponseHeaders,
  setResponseStatus,
} from 'h3'

const mockRuntimeConfig: Record<string, string | undefined> = {}

const useRuntimeConfig = () => mockRuntimeConfig

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
  setHeader,
  setResponseHeaders,
  setResponseStatus,
  useRuntimeConfig,
}

for (const [name, fn] of Object.entries(globals)) {
  ;(globalThis as Record<string, unknown>)[name] = fn
}
