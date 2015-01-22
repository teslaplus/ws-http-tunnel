#!/usr/bin/env node

// v0.11.14
var WebSocketServer = require('websocket').server;
var WebSocketConnection = require('websocket').connection;
WebSocketConnection.prototype.sendJSON = function sendJSON(message) {
  this.sendUTF(JSON.stringify(message));
};
var http = require('http');
var log = require('util').log;
var format = require('util').format;
// regex to extract device id from path
var reDeviceAndPath = /\/(\d+)(\/.*)/;
// Currently connected devices (id -> connection)
var deviceConnections = {};
/*
  http server forwards incoming connections to devices based on leading path component

  Example:
  GET `/123456789/photos/` would look up device `123456789` and:

  If ready (connected):
      - forward request (via WS connection)
      - ('GET /photos'), headers and body content as separate messages
  If the device is not ready (not connected):
      - respond with 502
 */
var server = http.createServer(function (request, response) {
  var parsedPath = reDeviceAndPath.exec(request.url);
  if (parsedPath) {
    var deviceId = parsedPath[1];
    var path = parsedPath[2];
    var method = request.method;
    log('received request for device ' + deviceId + ': ' + method + ' ' + path);
    // TODO: lookup device and see if it's connected.
    var deviceConnection = deviceConnections[deviceId];
    // If so, send request via websocket connection
    if (deviceConnection) {
      deviceConnection.sendJSON({
        method: method,
        path: path,
        headers: request.headers
      });
      deviceConnection.handler = function (httpMessage) {
        console.log(httpMessage);
        response.writeHead(httpMessage.statusCode, httpMessage.headers);
        response.end(JSON.stringify(httpMessage.body));
      };
    } else {
      // If no, send 502
      response.writeHead(502);
      response.end(format('device with id "%s" is not connected', deviceId));
    }
  } else {
    response.writeHead(404);
    response.end();
  }
});
server.listen(8080, function () {
  log('server is listening on port 8080');
});
wsServer = new WebSocketServer({
  httpServer: server,
  autoAcceptConnections: false,
  useNativeKeepalive: true // false breaks server during ping
});

function originIsAllowed(origin) {
  // TODO: put logic here to detect whether the specified origin is allowed.
  return true;
}
// register a device so it can be accessed by its id
var deviceConnected = function (deviceId, connection) {
  // register device
  connection.on('close', function (reasonCode, description) {
    log('device ' + deviceId + ' disconnected.');
    delete deviceConnections[deviceId];
  });
  deviceConnections[deviceId] = connection;
};
// message handler code
var messages = {
  handshake: function (message, connection) {
    var deviceId = message.device.id;
    log('handshake received from device ' + deviceId);
    connection.sendJSON({
      type: 'handshake',
      status: 'ok'
    });
    deviceConnected(deviceId, connection);
  },
  'http-response': function (message, connection) {
    if (connection.handler) {
      connection.handler(message);
      delete connection.handler;
    }
  }
};
// error handler code
var errors = {
  invalidType: function (message) {
    log('unknown message type ' + message.type);
    log(JSON.stringify(message));
  }
};
// handle an incoming websocket message (json)
function handleMessage(message) {
  (messages[message.type] || errors.invalidType).apply(null, arguments);
}
wsServer.on('request', function (request) {
  if (!originIsAllowed(request.origin)) {
    // Make sure we only accept requests from an allowed origin
    request.reject();
    log('Connection from origin ' + request.origin + ' rejected.');
    return;
  }
  var connection = request.accept('httpd', request.origin);
  connection.on('message', function (message) {
    if (message.type === 'utf8') {
      var logData = message.utf8Data.slice(0, 100);
      log('received message: ' + logData);
      handleMessage(JSON.parse(message.utf8Data), connection);
    } else if (message.type === 'binary') {
      log('received binary message of ' + message.binaryData.length + ' bytes');
      // echo: connection.sendBytes(message.binaryData);
    }
  });
});
