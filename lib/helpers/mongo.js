#!/usr/bin/env node

var Path = require('path')
  , Optionall = require('optionall')
  , Async = require('async')
  , _ = require('underscore')
  , Belt = require('jsbelt')
  , Winston = require('winston')
  , Events = require('events')
  , Mongodb = require('mongodb')
;

module.exports = function(O){
  var Opts = O || new Optionall({
                                  '__dirname': Path.resolve(module.filename + '/../..')
                                , 'file_priority': ['package.json', 'environment.json', 'config.json']
                                });

  var S = new (Events.EventEmitter.bind({}))();
  S.settings = Belt.extend({
    'log_level': 'debug'
  // server
  }, Opts);

  S.instance = S.settings.instance;

  var log = S.instance.log || new Winston.Logger();
  if (!S.instance.log) log.add(Winston.transports.Console, {'level': S.settings.log_level, 'colorize': true, 'timestamp': false});

  S['dbs'] = {};

////////////////////////////////////////////////////////////////////////////////
////METHODS                                                                  ////
////////////////////////////////////////////////////////////////////////////////

  S['dbConnect'] = function(options, callback){
    var a = Belt.argulint(arguments)
      , self = this;
    a.o = _.defaults(a.o, {
      //db
      'host': self.settings.mongodb.host
    , 'port': self.settings.mongodb.port
    });

    var gb ={};
    return Async.waterfall([
      function(cb){
        gb['db'] = self.dbs[a.o.db];

        if (gb.db) return cb();

        return Mongodb.MongoClient.connect('mongodb://' + a.o.host + ':' + a.o.port + '/' + a.o.db
        , Belt.cs(cb, self.dbs, a.o.db + '.conn', 1, 0));
      }
    , function(cb){
        if (gb.db) return cb();

        gb['db'] = self.dbs[a.o.db];
        gb.db['collections'] = {};

        gb.db.conn.on('error', function(err){
          Belt.get(gb, 'db.conn.close()');
          Belt.delete(self.dbs, a.o.db);
        });

        gb.db.conn.on('close', function(err){
          Belt.get(gb, 'db.conn.close()');
          Belt.delete(self.dbs, a.o.db);
        });

        return cb();
      }
    ], function(err){
      if (!err && !gb.db) err = new Error('db not connected');
      if (err) Belt.delete(self.dbs, a.o.db);

      return a.cb(err, gb.db);
    });
  };

  S['getCollection'] = function(options, callback){
    var a = Belt.argulint(arguments)
      , self = this;
    a.o = _.defaults(a.o, {
      //db
      //collection
    });

    var gb ={};
    return Async.waterfall([
      function(cb){
        gb['conn'] = Belt.get(self.dbs, a.o.db + '.conn');

        if (gb.conn) return cb();

        return self.dbConnect(a.o, Belt.cs(cb, gb, 'conn', 1, 'conn', 0));
      }
    , function(cb){
        return gb.conn.collection(a.o.collection, Belt.cs(cb, gb, 'collection', 1, 0));
      }
    , function(cb){
        if (!gb.collection) return cb(new Error('collection not found'));

        Belt.set(self.dbs[a.o.db], 'collections.' + a.o.collection, gb.collection);

        return cb();
      }
    ], function(err){
      if (err) Belt.delete(self.dbs, a.o.db + '.collections.' + a.o.collection);

      return a.cb(err, gb.collection);
    });
  };

  S['wrapper'] = function(options, callback){
    var a = Belt.argulint(arguments)
      , self = this;
    a.o = _.defaults(a.o, {
      //db
      //collection
      //method
      //args
    });

    var gb ={};
    return Async.waterfall([
      function(cb){
        return self.getCollection(a.o, Belt.cs(cb, gb, 'collection', 1, 0));
      }
    , function(cb){
        if (!gb.collection[a.o.method]) return cb(new Error('method not found'));

        var args;

        if (a.o.method === 'find'){
          args = Belt.objCast(_.pick(a.o.args, [
            'skip'
          , 'limit'
          , 'min'
          , 'max'
          ]), {
            'skip': 'number'
          , 'limit': 'number'
          , 'min': 'number'
          , 'max': 'number'
          }, {
            'skip_null': true
          });

          gb['cursor'] = gb.collection.find(a.o.args.query);
          _.each(args, function(v, k){
            gb.cursor = gb.cursor[k](v);
          });

          return gb.cursor.toArray(Belt.cs(cb, gb, 'data', 1, 0));
        }

        if (a.o.method === 'findOne'){
          args = Belt.objCast(_.omit(a.o.args, [
            'query'
          , 'filter'
          ]), {
            'skip': 'number'
          , 'limit': 'number'
          , 'min': 'number'
          , 'max': 'number'
          }, {
            'skip_null': true
          });

          return gb.collection.findOne(
            a.o.args.query || a.o.args.filter
          , args
          , Belt.cs(cb, gb, 'data', 1, 0));
        }

        if (a.o.method === 'findOneAndUpdate'){
          args = Belt.objCast(_.omit(a.o.args, [
            'query'
          , 'filter'
          , 'update'
          ]), {
            'skip': 'number'
          , 'limit': 'number'
          , 'min': 'number'
          , 'max': 'number'
          , 'upsert': 'boolean'
          }, {
            'skip_null': true
          });

          return gb.collection.findOneAndUpdate(
            a.o.args.query || a.o.args.filter
          , a.o.args.update
          , args
          , Belt.cs(cb, gb, 'data', 1, 0));
        }

        if (a.o.method === 'findOneAndDelete'){
          args = Belt.objCast(_.omit(a.o.args, [
            'query'
          , 'filter'
          ]), {
            'skip': 'number'
          , 'limit': 'number'
          , 'min': 'number'
          , 'max': 'number'
          }, {
            'skip_null': true
          });

          return gb.collection.findOneAndDelete(
            a.o.args.query || a.o.args.filter
          , args
          , Belt.cs(cb, gb, 'data', 1, 0));
        }

        if (a.o.method === 'findOneAndReplace'){
          args = Belt.objCast(_.omit(a.o.args, [
            'query'
          , 'filter'
          , 'replacement'
          ]), {
            'skip': 'number'
          , 'limit': 'number'
          , 'min': 'number'
          , 'max': 'number'
          }, {
            'skip_null': true
          });

          return gb.collection.findOneAndReplace(
            a.o.args.query || a.o.args.filter
          , a.o.args.replacement
          , args
          , Belt.cs(cb, gb, 'data', 1, 0));
        }


        if (a.o.method === 'insertOne'){
          args = Belt.objCast(_.omit(a.o.args, [
            'doc'
          ]), {

          }, {
            'skip_null': true
          });

          return gb.collection.insertOne(
            a.o.args.doc
          , args
          , Belt.cs(cb, gb, 'data', 1, 0));
        }

        if (a.o.method === 'insertMany'){
          args = Belt.objCast(_.omit(a.o.args, [
            'docs'
          ]), {

          }, {
            'skip_null': true
          });

          return gb.collection.insertMany(
            a.o.args.docs
          , args
          , Belt.cs(cb, gb, 'data', 1, 0));
        }

        if (a.o.method === 'deleteOne'){
          args = Belt.objCast(_.omit(a.o.args, [
            'query'
          , 'filter'
          ]), {

          }, {
            'skip_null': true
          });

          return gb.collection.deleteOne(
            a.o.args.query || a.o.args.filter
          , args
          , Belt.cs(cb, gb, 'data', 1, 0));
        }

        if (a.o.method === 'deleteMany'){
          args = Belt.objCast(_.omit(a.o.args, [
            'query'
          , 'filter'
          ]), {

          }, {
            'skip_null': true
          });

          return gb.collection.deleteMany(
            a.o.args.query || a.o.args.filter
          , args
          , Belt.cs(cb, gb, 'data', 1, 0));
        }

        if (a.o.method === 'updateOne'){
          args = Belt.objCast(_.omit(a.o.args, [
            'query'
          , 'filter'
          , 'update'
          ]), {
            'skip': 'number'
          , 'limit': 'number'
          , 'min': 'number'
          , 'max': 'number'
          , 'upsert': 'boolean'
          }, {
            'skip_null': true
          });

          return gb.collection.updateOne(
            a.o.args.query || a.o.args.filter
          , a.o.args.update
          , args
          , Belt.cs(cb, gb, 'data', 1, 0));
        }

        if (a.o.method === 'updateMany'){
          args = Belt.objCast(_.omit(a.o.args, [
            'query'
          , 'filter'
          , 'update'
          ]), {
            'skip': 'number'
          , 'limit': 'number'
          , 'min': 'number'
          , 'max': 'number'
          , 'upsert': 'boolean'
          }, {
            'skip_null': true
          });

          return gb.collection.updateMany(
            a.o.args.query || a.o.args.filter
          , a.o.args.update
          , args
          , Belt.cs(cb, gb, 'data', 1, 0));
        }
      }
    ], function(err){
      return a.cb(err, gb.data);
    });
  };

////////////////////////////////////////////////////////////////////////////////
////ROUTES                                                                  ////
////////////////////////////////////////////////////////////////////////////////

  S.instance.express.all('/db/:db/collection/:collection/method/:method.json', function (req, res){
    return S.wrapper({
      'db': req.params.db
    , 'collection': req.params.collection
    , 'method': req.params.method
    , 'args': _.extend({}, req.query || {}, req.body || {})
    }, function(err, data){
      return res.status(200).json({
        'error': Belt.get(err, 'message')
      , 'data': data
      });
    });
  });

////////////////////////////////////////////////////////////////////////////////
////SETUP                                                                   ////
////////////////////////////////////////////////////////////////////////////////

  setTimeout(function(){
    return S.emit('ready');
  }, 0);

  return S;
};
