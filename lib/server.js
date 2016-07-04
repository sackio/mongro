#!/usr/bin/env node

var Path = require('path')
  , Optionall = require('optionall')
  , Async = require('async')
  , _ = require('underscore')
  , Belt = require('jsbelt')
  , Moment = require('moment')
  , FS = require('fs')
  , CP = require('child_process')
  , Util = require('util')
  , Events = require('events')
  , Winston = require('winston')
  , Crypto = require('crypto')
  , Express = require('express')
  , HTTP = require('http')
  , Sessions = require('express-session')
  , RedisSessions = require('connect-redis')(Sessions)
  , Morgan = require('morgan')
  , BodyParser = require('body-parser')
  , Cookie = require('cookie')
  , Request = require('request')
  , CookieParser = require('cookie-parser')
  , ErrorHandler = require('errorhandler')
  , ServeFavicon = require('serve-favicon')
  , Redis = require('redis')
  , Timeout = require('connect-timeout')
  , BasicAuth = require('basic-auth')
;

module.exports = function(O){
  //////////////////////////////////////////////////////////////////////////////
  ////                            SETUP                                     ////
  //////////////////////////////////////////////////////////////////////////////

  process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

  var Opts = O || new Optionall({
                                  '__dirname': Path.resolve(module.filename + '/../..')
                                , 'file_priority': [
                                    'package.json'
                                  , 'environment.json'
                                  , 'credentials.json'
                                  ]
                                });

  var S = new (Events.EventEmitter.bind({}))();
  S.settings = Belt.extend({
    'log_level': 'debug'
  }, Opts);

  var log = Opts.log || new Winston.Logger();
  if (!Opts.log) log.add(Winston.transports.Console, {'level': S.settings.log_level, 'colorize': true, 'timestamp': false});
  S.log = log;

  //error handler
  S.on('error', function(err){
//    Request({
//      'url': S.settings['2post']
//    , 'method': 'post'
//    , 'form': {
//        'event': 'server error'
//      , 'message': Belt.get(err, 'message')
//      }
//    }, Belt.noop);

    log.error(err);
  });

////////////////////////////////////////////////////////////////////////////////
////SERVICES / DATA                                                         ////
////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////
////SETUP                                                                   ////
////////////////////////////////////////////////////////////////////////////////

  /*
    setup redis
  */
  S['setupRedis'] = function(options, callback){
    var a = Belt.argulint(arguments)
      , self = this;
    a.o = _.defaults(a.o, {
    
    });

    var ocb = _.once(a.cb);

    self['redis'] = Redis.createClient(a.o);

    self.redis.on('error', function(err){
      return self.emit('error', err);
    });

    self.redis.on('ready', function(){
      self.log.info('Connected to Redis...');
      return ocb();
    });
  };

  /*
    setup session store
  */
  S['setupSessions'] = function(options, callback){
    var a = Belt.argulint(arguments)
      , self = this;
    a.o = _.defaults(a.o, {

    });

    self['sessionsStore'] = new RedisSessions(a.o);
    self['sessions'] = self.sessionsStore; //alias

    a.cb();
    return self;
  };

  /*
    setup express server for incoming requests
  */
  S['setupServer'] = function(options, callback){
    var a = Belt.argulint(arguments)
      , self = this;
    a.o = _.defaults(a.o, {
      //session_secret
      'cookie_secret': Crypto.randomBytes(512).toString('utf-8')
    , 'body_parser': {
        'limit': '500mb'
      , 'parameterLimit': 10000
      , 'extended': true
      }
    , 'sessions': {
        'store': self.sessionsStore
      , 'secret': a.o.session_secret || Crypto.randomBytes(512).toString('utf-8')
      , 'cookie': {'maxAge': 60000000}
      , 'key': a.o.session_key
      , 'saveUninitialized': true
      , 'resave': true
      }
    , 'views':  Path.join(self.settings.__dirname, '/lib/views')
    });

    self['express'] = Express();
    self.express.set('env', self.settings.environment);
    self.express.set('port', a.o.port);
    self.express.set('view engine', 'ejs');
    self.express.set('views', a.o.views);

    /*
      middleware
    */
    self['logger'] = self.settings.environment === 'production' 
      ? Morgan('common', {'skip': function(req, res) { return res.statusCode < 400; }})
      : Morgan('dev');
    self.express.use(self.logger);

    self['bodyParserJSON'] = BodyParser.json(a.o.body_parser);
    self.express.use(self.bodyParserJSON);

    self['bodyParserURLEncoded'] = BodyParser.urlencoded(a.o.body_parser);
    self.express.use(self.bodyParserURLEncoded);

    self['cookieParser'] = CookieParser(a.o.cookie_secret);
    self.express.use(self.cookieParser);

    self['sessions'] = Sessions(a.o.sessions);
    self.express.use(self.sessions);

    self['errorHandler'] = ErrorHandler();
    self.express.use(self.errorHandler);

    //self.express.use(ServeFavicon(Path.join(self.settings.__dirname, a.o.favicon)));

    self.express.use(Timeout('100m'));

    self.express.disable('x-powered-by');
    self.express.set('trust proxy', true);

    self['httpServer'] = HTTP.createServer(self.express).listen(a.o.port, function(){
      log.info('[HTTP] Express server started');
      log.info(Belt.stringify({
        'environment': self.settings.environment.toUpperCase()
      , 'port': self.express.get('port')
      }));

      return a.cb();
    });

    return self;
  };

  S['setupHelpers'] = function(options, callback){
    var a = Belt.argulint(arguments)
      , self = this;
    a.o = _.defaults(a.o, {
    
    });

    var gb = {};
    Async.waterfall([
      function(cb){
        return CP.exec('mkdir -p "' + Path.join(self.settings.__dirname, '/lib/helpers') + '"', Belt.cw(cb));
      }
    , function(cb){
        self['helpers'] = _.chain(FS.readdirSync(Path.join(self.settings.__dirname, '/lib/helpers')))
                           .filter(function(f){ return f.match(/\.(js|json)$/i); })
                           .value();

        if (!_.any(self.helpers)) return cb();

        self.helpers = _.object(
                         _.map(self.helpers, function(g){ return g.replace(/\.(js|json)$/i, ''); })
                       , _.map(self.helpers, function(g){
                           return require(Path.join(self.settings.__dirname, '/lib/helpers/', g));
                         })
                       );

        return Async.eachSeries(_.keys(self.helpers), function(k, cb2){
          log.info('Creating helper [%s]...', k);
          self.helpers[k] = new self.helpers[k](_.extend(
            {}, self.settings, {'log': S.log, 'name': k, 'instance': self})
          ).once('ready', Belt.cw(cb2));

          self.helpers[k].on('error', function(err){
            return self.emit('error', err);
          });
        }, Belt.cw(cb, 0));
      }
    ], a.cb);

    return self;
  }

  S['setupControllers'] = function(options, callback){
    var a = Belt.argulint(arguments)
      , self = this;
    a.o = _.defaults(a.o, {
    
    });

    var gb = {};
    Async.waterfall([
      function(cb){
        return CP.exec('mkdir -p "' + Path.join(self.settings.__dirname, '/lib/controllers') + '"', Belt.cw(cb));
      }
    , function(cb){
        self['controllers'] = _.chain(FS.readdirSync(Path.join(self.settings.__dirname, '/lib/controllers')))
                           .filter(function(f){ return f.match(/\.(js|json)$/i); })
                           .value();

        if (!_.any(self.controllers)) return cb();

        self.controllers = _.object(
                         _.map(self.controllers, function(g){ return g.replace(/\.(js|json)$/i, ''); })
                       , _.map(self.controllers, function(g){
                           return require(Path.join(self.settings.__dirname, '/lib/controllers/', g));
                         })
                       );

        return Async.eachSeries(_.keys(self.controllers), function(k, cb2){
          log.info('Creating controller [%s]...', k);
          self.controllers[k] = new self.controllers[k](_.extend(
            {}, self.settings, {'log': S.log, 'name': k, 'instance': self})
          ).once('ready', Belt.cw(cb2));

          self.controllers[k].on('error', function(err){
            return self.emit('error', err);
          });
        }, Belt.cw(cb, 0));
      }
    ], a.cb);

    return self;
  }

  Async.waterfall([
    function(cb){
      return S.setupSessions(S.settings.redis, Belt.cw(cb, 0));
    }
  , function(cb){
      return S.setupRedis(_.omit(S.settings.redis, ['prefix']), Belt.cw(cb, 0));
    }
  , function(cb){
      return S.setupServer(S.settings.express, Belt.cw(cb, 0));
    }
  , function(cb){
      S['status'] = {};

      S.express.all('/', function(req, res){
        return res.status(200).json(S.status);
      });

      return cb();
    }
  , function(cb){
      return S.setupHelpers(S.settings, Belt.cw(cb, 0));
    }
  , function(cb){
      return S.setupControllers(S.settings, Belt.cw(cb, 0));
    }
  ], function(err){
    if (err) return S.emit(err);

    log.info('/////READY/////');

    return S.emit('ready');
  });

  return S;
};

if (require.main === module){
  var M = new module.exports();
}
