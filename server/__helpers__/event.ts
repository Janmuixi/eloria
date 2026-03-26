import { createEvent } from 'h3'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'

interface MockEventOptions {
  method?: string
  url?: string
  body?: unknown
  params?: Record<string, string>
  cookies?: Record<string, string>
  headers?: Record<string, string>
}

export function createMockEvent(options: MockEventOptions = {}) {
  const socket = new Socket()
  const req = new IncomingMessage(socket)
  req.method = options.method || 'GET'
  req.url = options.url || '/'
  req.headers = {}

  if (options.headers) {
    for (const [key, value] of Object.entries(options.headers)) {
      req.headers[key.toLowerCase()] = value
    }
  }

  if (options.cookies) {
    req.headers.cookie = Object.entries(options.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')
  }

  if (options.body) {
    req.headers['content-type'] = 'application/json'
  }

  const res = new ServerResponse(req)
  const event = createEvent(req, res)

  // Pre-populate parsed body cache for readBody()
  // h3 v1.15+ uses _requestBody as the internal cache key
  if (options.body !== undefined) {
    ;(event as any)._requestBody = options.body
  }

  // Set router params for getRouterParam()
  if (options.params) {
    event.context.params = options.params
  }

  return event
}
