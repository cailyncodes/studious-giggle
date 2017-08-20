const hapi = require('hapi');
const hoek = require('hoek');
const handlebars = require('handlebars');
const vision = require('vision');
const inert = require('inert');
const mongo = require('mongodb').MongoClient;
const yar = require('yar');
const UUID = require('uuid');
const xkcdPassword = require('xkcd-password');
const pw = new xkcdPassword();
pw.initWithWordFile(__dirname + "/wordlist.txt");

(async () => {
  // Set up effective enums
  const ERROR = {};
  ERROR.DATABASE = {};
  ERROR.DATABASE.EMPTY = "Database Failure -- Empty Response";
  ERROR.NO_STAGE = "No Stage";
  ERROR.NO_NAME = "No Name";
  ERROR.NO_PASSPHRASE = "No Passphrase";
  const TYPE = {};
  TYPE.ERROR = "error";
  TYPE.SUCCESS = "success";

  // Set up database
  let dbUrl = process.env.MONGODB_URI || `mongodb://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_LOCATION}`;
  let db;
  try {
    db = await mongo.connect(dbUrl, {});
  } catch (e) {
    console.error(e);
    process.exit(1);
  }

  // Set up server
  const server = new hapi.Server();
  const port = process.env.PORT;
  const host = "0.0.0.0";
  server.connection({ port, host });

  // Register template rendering plugin
  server.register([
    vision, 
    {
      register: yar,
      options: {
        storeBlank: false,
        cookieOptions: {
          password: process.env.SESSION_PASSWORD,
          isSecure: process.env.NODE_ENV === 'production'
        },
        cache: {
          expiresIn: 1000 * 60 * 60 * 24 * 365
        }
      }
    },
    inert
  ],
  (err) => {

    hoek.assert(!err, err);

    // Configure templating engine
    server.views({
      engines: {
          html: handlebars
      },
      relativeTo: __dirname,
      path: './templates',
      helpersPath: './templates/helpers'
    });

    server.route({
      method: 'GET',
      path: '/favicon.ico',
      handler: function(request, reply) {
        reply();
      }
    });

    server.route({
      method: 'GET',
      path: '/static/{param*}',
      handler: {
        directory: {
          path: 'static'
        }
      }
    });

    server.route({
      method: 'POST',
      path: '/14qb58e6g9ds', // enter name
      handler: function(request, reply) {
        let body = request.payload;
        let name = body && body.name || '';

        if (!name) {
          console.error("No name submitted with form");
          reply.view('error', {
            error: ERROR.NO_NAME
          });
          return;
        }

        let session = request.yar;
        let id = UUID.v4()
        session.set('id', id);
        session.set('name', name);
        pw.generate({
          numWords: 3,
          minLength: 4,
          maxLength: 12
        })
        .then(passphrase => {
          passphrase = passphrase.join(" ");
          session.set('passphrase', passphrase);
          let stage = "/3f576fq123c0"; // stage 1
          session.set('stage', stage);

          let userResult = createUser(id, {
            name,
            passphrase,
            stage
          });

          if (userResult.type === TYPE.ERROR) {
            console.error(userResult.content);
            throw new Error(ERROR.DATABASE.CREATING_USER);
          }

          reply().code(302).header("Location", stage);
          return;
        })
        .catch(err => {
          session.reset();
          console.error(err);
          reply.view('error', {
            error: ERROR.NO_PASSPHRASE
          });
          return;
        });
      }
    });

    server.route({
      method: 'POST',
      path: '/201xu9z4y5z4', // answer challenge
      handler: async function(request, reply) {
        let body = request.payload;
        let answer = body && body.answer || '';

        if (!answer) {
          console.error("No answer submitted with form");
          reply.view('error', {
            error: ERROR.NO_ANSWER
          });
          return;
        }

        let session = request.yar;
        
        if (answer === "no") {
          session.set('noaccept', true);
          reply().code(302).header("Location", "https://brown.edu");
          return;
        }
        
        if (answer === "yes") {
          let stage = "/6zoar22fg0k0";
          session.set('stage', stage);
          try {
            await updateUserStage(session.get('id'), stage);
            reply().code(302).header("Location", stage);
            return;
          } catch (e) {
            console.error(e);
            reply.view('error', {
              error: ERROR.NO_STAGE
            });
            return;
          }
        }

        reply.view('error', {
          error: ERROR.CHEATING
        });
      }
    });

    // Set up catch all path
    server.route({
      method: 'GET',
      path: '/{path*}',
      handler: async function (request, reply) {
        // add a trailing "/" to all paths
        let path = request.params.path || '';
        path = "/".concat(path);
        console.log(path);
        // setup session
        let session = request.yar;
        if (session.get('noaccept') === true) {
          reply().code(302).header("Location", "https://brown.edu");
          return;
        }
        
        let id = session.get('id');
        let name = session.get('name');
        let passphrase = session.get('passphrase');
        let stage = session.get('stage');
        // send people who are signed in to their current stage
        // regardless of what the requested url was
        if (id) {
          try {
            let userResult = await getUserById(id);
            if (userResult.type === TYPE.ERROR) {
              throw new Error(userResult.content);
            }
            let dbStage = userResult.content.stage;
            if (stage !== dbStage) {
              reply.view('error', {
                error: ERROR.CHEATING
              });
              return;
            }
          } catch (e) {
            console.error(e);
            reply.view('error', {
              error: ERROR.NO_STAGE
            });
            return;
          }
        } else {
          stage = "/";
        }

        if (path !== stage) {
          reply().code(302).header("Location", stage);
          return;
        }

        // get html title based on stage
        let titleResult = await getContentByPath("title", stage);
        if (!titleResult || titleResult.type === TYPE.ERROR) {
          let error = titleResult.content;
          console.error(error);
          reply.view('error', {
            error
          });
          return;
        }
        
        // get html content based on stage
        let contentResult = await getContentByPath("content", stage);
        if (!contentResult || contentResult.type === TYPE.ERROR) {
          let error = contentResult.content;
          console.error(error);
          reply.view('error', {
            error
          });
          return;
        }

        let title = titleResult.content;
        let content = contentResult.content;
        reply.view('index', {
          title,
          content,
          config: {
            name,
            passphrase
          }
        });
        return;
      }
    });
  });

  server.start((err) => {
    if (err) {
        throw err;
    }
    console.log(`Server running at: ${server.info.uri}`);
  });

  async function getContentByPath(collectionName, path) {
    let contentCollection = db.collection(collectionName);
    let contentResult;
    try {
      contentResult = await contentCollection.findOne({
        path
      });
    } catch (e) {
      console.error(e);
      return {
        type: TYPE.ERROR,
        content: e
      }
    }
    let dbEmptyContent;
    if (!contentResult) {
      try {
        dbEmptyContent = await contentCollection.findOne({
          path: "/empty"
        });

        if (!dbEmptyContent) {
          throw new Error(ERROR.DATABASE.EMPTY);
        } else {
          dbEmptyContent = dbEmptyContent.content;
        }
      } catch (e) {
        console.error(e);
        return {
          type: TYPE.ERROR,
          content: e
        }
      }
    }

    return {
      type: TYPE.SUCCESS,
      content: contentResult && contentResult.content || dbEmptyContent
    }
  }

  async function getUserById(id) {
    let users = db.collection('users');
    let userResult;
    try {
      userResult = await users.findOne({
        id
      });
      if (!userResult) {
        throw new Error(ERROR.DATABASE.EMPTY);
      }
    } catch (e) {
      console.error(e);
      return {
        type: TYPE.ERROR,
        content: e
      }
    }
    return {
      type: TYPE.SUCCESS,
      content: userResult
    }
  }

  async function createUser(id, data) {
    let users = db.collection('users');
    let userResult;
    try {
      userResult = await users.insertOne({
        id,
        name: data.name,
        passphrase: data.passphrase,
        stage: data.stage
      });
    } catch (e) {
      console.error(e);
      return {
        type: TYPE.ERROR,
        content: e
      }
    }
    return {
      type: TYPE.SUCCESS,
      content: userResult
    }
  }

  async function updateUserStage(id, stage) {
    let users = db.collection('users');
    let userResult;
    try {
      userResult = await users.updateOne({
        id
      },
      {
        $set: { stage }
      });
    } catch (e) {
      console.error(e);
      return {
        type: TYPE.ERROR,
        content: e
      }
    }
    return {
      type: TYPE.SUCCESS,
      content: userResult
    }
  }
})();
