'use strict'

const { connect } = require('node:net')
const { test } = require('node:test')
const Fastify = require('..')
const { kRequest } = require('../lib/symbols.js')

test('default 400 on request error', (t, done) => {
  t.plan(4)

  const fastify = Fastify()

  fastify.post('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    simulate: {
      error: true
    },
    body: {
      text: '12345678901234567890123456789012345678901234567890'
    }
  }, (err, res) => {
    t.assert.ifError(err)
    t.assert.strictEqual(res.statusCode, 400)
    t.assert.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8')
    t.assert.deepStrictEqual(JSON.parse(res.payload), {
      error: 'Bad Request',
      message: 'Simulated',
      statusCode: 400
    })
    done()
  })
})

test('default 400 on request error with custom error handler', (t, done) => {
  t.plan(6)

  const fastify = Fastify()

  fastify.setErrorHandler(function (err, request, reply) {
    t.assert.strictEqual(typeof request, 'object')
    t.assert.strictEqual(request instanceof fastify[kRequest].parent, true)
    reply
      .code(err.statusCode)
      .type('application/json; charset=utf-8')
      .send(err)
  })

  fastify.post('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    simulate: {
      error: true
    },
    body: {
      text: '12345678901234567890123456789012345678901234567890'
    }
  }, (err, res) => {
    t.assert.ifError(err)
    t.assert.strictEqual(res.statusCode, 400)
    t.assert.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8')
    t.assert.deepStrictEqual(JSON.parse(res.payload), {
      error: 'Bad Request',
      message: 'Simulated',
      statusCode: 400
    })
    done()
  })
})

test('default clientError handler ignores ECONNRESET', (t, done) => {
  t.plan(3)

  let logs = ''
  let response = ''

  const fastify = Fastify({
    bodyLimit: 1,
    keepAliveTimeout: 100,
    logger: {
      level: 'trace',
      stream: {
        write () {
          logs += JSON.stringify(arguments)
        }
      }
    }
  })

  fastify.get('/', (request, reply) => {
    reply.send('OK')

    process.nextTick(() => {
      const error = new Error()
      error.code = 'ECONNRESET'

      fastify.server.emit('clientError', error, request.raw.socket)
    })
  })

  fastify.listen({ port: 0 }, function (err) {
    t.assert.ifError(err)
    t.after(() => fastify.close())

    const client = connect(fastify.server.address().port)

    client.on('data', chunk => {
      response += chunk.toString('utf-8')
    })

    client.on('end', () => {
      t.assert.match(response, /^HTTP\/1.1 200 OK/)
      t.assert.notEqual(logs, /ECONNRESET/)
      done()
    })

    client.resume()
    client.write('GET / HTTP/1.1\r\n')
    client.write('Host: example.com\r\n')
    client.write('Connection: close\r\n')
    client.write('\r\n\r\n')
  })
})

test('default clientError handler ignores sockets in destroyed state', t => {
  t.plan(1)

  const fastify = Fastify({
    bodyLimit: 1,
    keepAliveTimeout: 100
  })
  fastify.server.on('clientError', () => {
    // this handler is called after default handler, so we can make sure end was not called
    t.assert.ok('end should not be called')
  })
  fastify.server.emit('clientError', new Error(), {
    destroyed: true,
    end () {
      t.assert.fail('end should not be called')
    },
    destroy () {
      t.assert.fail('destroy should not be called')
    }
  })
})

test('default clientError handler destroys sockets in writable state', t => {
  t.plan(2)

  const fastify = Fastify({
    bodyLimit: 1,
    keepAliveTimeout: 100
  })

  fastify.server.emit('clientError', new Error(), {
    destroyed: false,
    writable: true,
    encrypted: true,
    end () {
      t.assert.fail('end should not be called')
    },
    destroy () {
      t.assert.ok('destroy should be called')
    },
    write (response) {
      t.assert.match(response, /^HTTP\/1.1 400 Bad Request/)
    }
  })
})

test('default clientError handler destroys http sockets in non-writable state', t => {
  t.plan(1)

  const fastify = Fastify({
    bodyLimit: 1,
    keepAliveTimeout: 100
  })

  fastify.server.emit('clientError', new Error(), {
    destroyed: false,
    writable: false,
    end () {
      t.assert.fail('end should not be called')
    },
    destroy () {
      t.assert.ok('destroy should be called')
    },
    write (response) {
      t.assert.fail('write should not be called')
    }
  })
})

test('error handler binding', (t, done) => {
  t.plan(5)

  const fastify = Fastify()

  fastify.setErrorHandler(function (err, request, reply) {
    t.assert.strictEqual(this, fastify)
    reply
      .code(err.statusCode)
      .type('application/json; charset=utf-8')
      .send(err)
  })

  fastify.post('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    simulate: {
      error: true
    },
    body: {
      text: '12345678901234567890123456789012345678901234567890'
    }
  }, (err, res) => {
    t.assert.ifError(err)
    t.assert.strictEqual(res.statusCode, 400)
    t.assert.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8')
    t.assert.deepStrictEqual(JSON.parse(res.payload), {
      error: 'Bad Request',
      message: 'Simulated',
      statusCode: 400
    })
    done()
  })
})

test('encapsulated error handler binding', (t, done) => {
  t.plan(7)

  const fastify = Fastify()

  fastify.register(function (app, opts, done) {
    app.decorate('hello', 'world')
    t.assert.strictEqual(app.hello, 'world')
    app.post('/', function (req, reply) {
      reply.send({ hello: 'world' })
    })
    app.setErrorHandler(function (err, request, reply) {
      t.assert.strictEqual(this.hello, 'world')
      reply
        .code(err.statusCode)
        .type('application/json; charset=utf-8')
        .send(err)
    })
    done()
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    simulate: {
      error: true
    },
    body: {
      text: '12345678901234567890123456789012345678901234567890'
    }
  }, (err, res) => {
    t.assert.ifError(err)
    t.assert.strictEqual(res.statusCode, 400)
    t.assert.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8')
    t.assert.deepStrictEqual(res.json(), {
      error: 'Bad Request',
      message: 'Simulated',
      statusCode: 400
    })
    t.assert.strictEqual(fastify.hello, undefined)
    done()
  })
})

test('default clientError replies with bad request on reused keep-alive connection', (t, done) => {
  t.plan(2)

  let response = ''

  const fastify = Fastify({
    bodyLimit: 1,
    keepAliveTimeout: 100
  })

  fastify.get('/', (request, reply) => {
    reply.send('OK\n')
  })

  fastify.listen({ port: 0 }, function (err) {
    t.assert.ifError(err)
    fastify.server.unref()

    const client = connect(fastify.server.address().port)

    client.on('data', chunk => {
      response += chunk.toString('utf-8')
    })

    client.on('end', () => {
      t.assert.match(response, /^HTTP\/1.1 200 OK.*HTTP\/1.1 400 Bad Request/s)
      done()
    })

    client.resume()
    client.write('GET / HTTP/1.1\r\n')
    client.write('Host: example.com\r\n')
    client.write('\r\n\r\n')
    client.write('GET /?a b HTTP/1.1\r\n')
    client.write('Host: example.com\r\n')
    client.write('Connection: close\r\n')
    client.write('\r\n\r\n')
  })
})

test('request.routeOptions.method is an uppercase string /1', async t => {
  t.plan(3)
  const fastify = Fastify()
  const handler = function (req, res) {
    t.assert.strictEqual('POST', req.routeOptions.method)
    res.send({})
  }

  fastify.post('/', {
    bodyLimit: 1000,
    handler
  })
  const fastifyServer = await fastify.listen({ port: 0 })
  t.after(() => fastify.close())

  const result = await fetch(fastifyServer, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([])
  })
  t.assert.ok(result.ok)
  t.assert.strictEqual(result.status, 200)
})

test('request.routeOptions.method is an uppercase string /2', async t => {
  t.plan(3)
  const fastify = Fastify()
  const handler = function (req, res) {
    t.assert.strictEqual('POST', req.routeOptions.method)
    res.send({})
  }

  fastify.route({
    url: '/',
    method: 'POST',
    bodyLimit: 1000,
    handler
  })
  const fastifyServer = await fastify.listen({ port: 0 })
  t.after(() => fastify.close())

  const result = await fetch(fastifyServer, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([])
  })
  t.assert.ok(result.ok)
  t.assert.strictEqual(result.status, 200)
})

test('request.routeOptions.method is an uppercase string /3', async t => {
  t.plan(3)
  const fastify = Fastify()
  const handler = function (req, res) {
    t.assert.strictEqual('POST', req.routeOptions.method)
    res.send({})
  }

  fastify.route({
    url: '/',
    method: 'pOSt',
    bodyLimit: 1000,
    handler
  })
  const fastifyServer = await fastify.listen({ port: 0 })
  t.after(() => fastify.close())

  const result = await fetch(fastifyServer, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([])
  })
  t.assert.ok(result.ok)
  t.assert.strictEqual(result.status, 200)
})

test('request.routeOptions.method is an array with uppercase string', async t => {
  t.plan(3)
  const fastify = Fastify()
  const handler = function (req, res) {
    t.assert.deepStrictEqual(['POST'], req.routeOptions.method)
    res.send({})
  }

  fastify.route({
    url: '/',
    method: ['pOSt'],
    bodyLimit: 1000,
    handler
  })
  const fastifyServer = await fastify.listen({ port: 0 })
  t.after(() => fastify.close())

  const result = await fetch(fastifyServer, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([])
  })
  t.assert.ok(result.ok)
  t.assert.strictEqual(result.status, 200)
})

test('test request.routeOptions.version', async t => {
  t.plan(6)
  const fastify = Fastify()

  fastify.route({
    method: 'POST',
    url: '/version',
    constraints: { version: '1.2.0' },
    handler: function (request, reply) {
      t.assert.strictEqual('1.2.0', request.routeOptions.version)
      reply.send({})
    }
  })

  fastify.route({
    method: 'POST',
    url: '/version-undefined',
    handler: function (request, reply) {
      t.assert.strictEqual(undefined, request.routeOptions.version)
      reply.send({})
    }
  })
  const fastifyServer = await fastify.listen({ port: 0 })
  t.after(() => fastify.close())

  const result1 = await fetch(fastifyServer + '/version', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept-Version': '1.2.0' },
    body: JSON.stringify([])
  })
  t.assert.ok(result1.ok)
  t.assert.strictEqual(result1.status, 200)

  const result2 = await fetch(fastifyServer + '/version-undefined', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([])
  })
  t.assert.ok(result2.ok)
  t.assert.strictEqual(result2.status, 200)
})
