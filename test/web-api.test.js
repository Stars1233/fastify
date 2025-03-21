'use strict'

const { test } = require('node:test')
const Fastify = require('../fastify')
const fs = require('node:fs')
const { Readable } = require('node:stream')
const { fetch: undiciFetch } = require('undici')

test('should response with a ReadableStream', async (t) => {
  t.plan(2)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    const stream = fs.createReadStream(__filename)
    reply.code(200).send(Readable.toWeb(stream))
  })

  const {
    statusCode,
    body
  } = await fastify.inject({ method: 'GET', path: '/' })

  const expected = await fs.promises.readFile(__filename)

  t.assert.strictEqual(statusCode, 200)
  t.assert.strictEqual(expected.toString(), body.toString())
})

test('should response with a Response', async (t) => {
  t.plan(3)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    const stream = fs.createReadStream(__filename)
    reply.send(new Response(Readable.toWeb(stream), {
      status: 200,
      headers: {
        hello: 'world'
      }
    }))
  })

  const {
    statusCode,
    headers,
    body
  } = await fastify.inject({ method: 'GET', path: '/' })

  const expected = await fs.promises.readFile(__filename)

  t.assert.strictEqual(statusCode, 200)
  t.assert.strictEqual(expected.toString(), body.toString())
  t.assert.strictEqual(headers.hello, 'world')
})

test('should response with a Response 204', async (t) => {
  t.plan(3)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    reply.send(new Response(null, {
      status: 204,
      headers: {
        hello: 'world'
      }
    }))
  })

  const {
    statusCode,
    headers,
    body
  } = await fastify.inject({ method: 'GET', path: '/' })

  t.assert.strictEqual(statusCode, 204)
  t.assert.strictEqual(body, '')
  t.assert.strictEqual(headers.hello, 'world')
})

test('should response with a Response 304', async (t) => {
  t.plan(3)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    reply.send(new Response(null, {
      status: 304,
      headers: {
        hello: 'world'
      }
    }))
  })

  const {
    statusCode,
    headers,
    body
  } = await fastify.inject({ method: 'GET', path: '/' })

  t.assert.strictEqual(statusCode, 304)
  t.assert.strictEqual(body, '')
  t.assert.strictEqual(headers.hello, 'world')
})

test('should response with a Response without body', async (t) => {
  t.plan(3)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    reply.send(new Response(null, {
      status: 200,
      headers: {
        hello: 'world'
      }
    }))
  })

  const {
    statusCode,
    headers,
    body
  } = await fastify.inject({ method: 'GET', path: '/' })

  t.assert.strictEqual(statusCode, 200)
  t.assert.strictEqual(body, '')
  t.assert.strictEqual(headers.hello, 'world')
})

test('able to use in onSend hook - ReadableStream', async (t) => {
  t.plan(4)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    const stream = fs.createReadStream(__filename)
    reply.code(500).send(Readable.toWeb(stream))
  })

  fastify.addHook('onSend', (request, reply, payload, done) => {
    t.assert.strictEqual(Object.prototype.toString.call(payload), '[object ReadableStream]')
    done(null, new Response(payload, {
      status: 200,
      headers: {
        hello: 'world'
      }
    }))
  })

  const {
    statusCode,
    headers,
    body
  } = await fastify.inject({ method: 'GET', path: '/' })

  const expected = await fs.promises.readFile(__filename)

  t.assert.strictEqual(statusCode, 200)
  t.assert.strictEqual(expected.toString(), body.toString())
  t.assert.strictEqual(headers.hello, 'world')
})

test('able to use in onSend hook - Response', async (t) => {
  t.plan(4)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    const stream = fs.createReadStream(__filename)
    reply.send(new Response(Readable.toWeb(stream), {
      status: 500,
      headers: {
        hello: 'world'
      }
    }))
  })

  fastify.addHook('onSend', (request, reply, payload, done) => {
    t.assert.strictEqual(Object.prototype.toString.call(payload), '[object Response]')
    done(null, new Response(payload.body, {
      status: 200,
      headers: payload.headers
    }))
  })

  const {
    statusCode,
    headers,
    body
  } = await fastify.inject({ method: 'GET', path: '/' })

  const expected = await fs.promises.readFile(__filename)

  t.assert.strictEqual(statusCode, 200)
  t.assert.strictEqual(expected.toString(), body.toString())
  t.assert.strictEqual(headers.hello, 'world')
})

test('Error when Response.bodyUsed', async (t) => {
  t.plan(4)

  const expected = await fs.promises.readFile(__filename)

  const fastify = Fastify()

  fastify.get('/', async function (request, reply) {
    const stream = fs.createReadStream(__filename)
    const response = new Response(Readable.toWeb(stream), {
      status: 200,
      headers: {
        hello: 'world'
      }
    })
    const file = await response.text()
    t.assert.strictEqual(expected.toString(), file)
    t.assert.strictEqual(response.bodyUsed, true)
    return reply.send(response)
  })

  const response = await fastify.inject({ method: 'GET', path: '/' })

  t.assert.strictEqual(response.statusCode, 500)
  const body = response.json()
  t.assert.strictEqual(body.code, 'FST_ERR_REP_RESPONSE_BODY_CONSUMED')
})

test('Error when Response.body.locked', async (t) => {
  t.plan(3)

  const fastify = Fastify()

  fastify.get('/', async function (request, reply) {
    const stream = Readable.toWeb(fs.createReadStream(__filename))
    const response = new Response(stream, {
      status: 200,
      headers: {
        hello: 'world'
      }
    })
    stream.getReader()
    t.assert.strictEqual(stream.locked, true)
    return reply.send(response)
  })

  const response = await fastify.inject({ method: 'GET', path: '/' })

  t.assert.strictEqual(response.statusCode, 500)
  const body = response.json()
  t.assert.strictEqual(body.code, 'FST_ERR_REP_READABLE_STREAM_LOCKED')
})

test('Error when ReadableStream.locked', async (t) => {
  t.plan(3)

  const fastify = Fastify()

  fastify.get('/', async function (request, reply) {
    const stream = Readable.toWeb(fs.createReadStream(__filename))
    stream.getReader()
    t.assert.strictEqual(stream.locked, true)
    return reply.send(stream)
  })

  const response = await fastify.inject({ method: 'GET', path: '/' })

  t.assert.strictEqual(response.statusCode, 500)
  const body = response.json()
  t.assert.strictEqual(body.code, 'FST_ERR_REP_READABLE_STREAM_LOCKED')
})

test('allow to pipe with fetch', async (t) => {
  t.plan(2)
  const abortController = new AbortController()
  const { signal } = abortController

  const fastify = Fastify()
  t.after(() => {
    fastify.close()
    abortController.abort()
  })

  fastify.get('/', function (request, reply) {
    return fetch(`${fastify.listeningOrigin}/fetch`, {
      method: 'GET',
      signal
    })
  })

  fastify.get('/fetch', function async (request, reply) {
    reply.code(200).send({ ok: true })
  })

  await fastify.listen()

  const response = await fastify.inject({ method: 'GET', path: '/' })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.deepStrictEqual(response.json(), { ok: true })
})

test('allow to pipe with undici.fetch', async (t) => {
  t.plan(2)
  const abortController = new AbortController()
  const { signal } = abortController

  const fastify = Fastify()
  t.after(() => {
    fastify.close()
    abortController.abort()
  })

  fastify.get('/', function (request, reply) {
    return undiciFetch(`${fastify.listeningOrigin}/fetch`, {
      method: 'GET',
      signal
    })
  })

  fastify.get('/fetch', function (request, reply) {
    reply.code(200).send({ ok: true })
  })

  await fastify.listen()

  const response = await fastify.inject({ method: 'GET', path: '/' })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.deepStrictEqual(response.json(), { ok: true })
})
