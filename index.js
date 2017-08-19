const hapi = require('hapi');
const hoek = require('hoek');
const handlebars = require('handlebars');
const vision = require('vision');

const server = new hapi.Server();
const port = process.env.PORT;
const host = "0.0.0.0";
server.connection({ port, host });

server.register(vision, (err) => {

  hoek.assert(!err, err);

  server.views({
    engines: {
        html: handlebars
    },
    relativeTo: __dirname,
    path: './templates',
    helpersPath: './helpers'
  });

  server.route({
    method: 'GET',
    path: '/',
    handler: function (request, reply) {
      reply.view('index', {
        title: "My Title",
        content: "<h1>Hello World</h1>"
      });
    }
  });
});

server.start((err) => {
    if (err) {
        throw err;
    }
    console.log(`Server running at: ${server.info.uri}`);
});
