const hapi = require('hapi');

const server = new hapi.Server();
const port = process.env.PORT;
const host = "localhost";
server.connection({ port, host });

server.route({
  method: "GET",
  path: "/",
  handler: function(req, resp) {
    resp("Hello World").code(200);
  }
});

server.start((err) => {
    if (err) {
        throw err;
    }
    console.log(`Server running at: ${server.info.uri}`);
});
