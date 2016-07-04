#!/usr/bin/env node

//Basic daemon, runs the instances with forever

var Forever = require('forever-monitor')
  , Path = require('path')
  , Optionall = require('optionall')
  , Belt = require('jsbelt')
  , Async = require('async')
  , _ = require('underscore')
  , OS = require('os')
  , O = new Optionall({'__dirname': Path.resolve(module.filename + '/../..')
                     , 'file_priority': ['package.json', 'assets.json', 'settings.json', 'environment.json', 'credentials.json']
                     })
  , FSTK = require('fstk')
  , Request = require('request')
  , Servers = []
;

var gb = {};
return Async.waterfall([
  function(cb){
    for (var i = 0; i < (O.max_cpus ? OS.cpus().length : 1); i++){
      Servers.push(Forever.start(Path.resolve(module.filename + '/../server.js'), {
        'env': O.argv || {}
      , 'watch': true
      , 'watchIgnoreDotFiles': true
      , 'watchDirectory': Path.resolve(module.filename + '/..')
      , 'watchIgnorePatterns': [
          '**/.git/**'
        ]
      , 'logFile': O.daemon_log
      , 'outFile': O.stdout
      , 'errFile': O.stderr
      }));
    }

    return cb();
  }
, function(cb){
    _.each(Servers, function(s){
      s.on('error', function(err){
        console.log(['ERROR: [', new Date().toString(), ']'].join(''));
        return console.log(Belt.stringify(arguments, null, 2));
      });
      
      s.on('start', function(){
        return console.log(['START: [', new Date().toString(), ']'].join(''));
      });
      
      s.on('stop', function(){
        return console.log(['STOP: [', new Date().toString(), ']'].join(''));
      });
      
      s.on('restart', function(){
        return console.log(['RESTART: [', new Date().toString(), ']'].join(''));
      });
      
      s.on('exit', function(){
        return console.log(['EXIT: [', new Date().toString(), ']'].join(''));
      });

      return;
    });
    return cb();
  }
], function(err){
  if (err){ console.error(err); process.exit(1); }
});
