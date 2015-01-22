#!/usr/bin/env node

var WebSocketClient = require('websocket').client;
var log = require('util').log;
var handshake = function () {
  return {
    type: 'handshake',
    device: {
      id: '1234567890'
    }
  };
};
var connect = function () {
  var client = new WebSocketClient();
  client.on('connectFailed', function (error) {
    log('Connect Error: ' + error.toString());
    setTimeout(connect, 2000);
  });
  client.on('connect', function (connection) {
    log('WebSocket Client Connected');
    var send = function (json) {
      if (connection.connected) {
        connection.sendUTF(JSON.stringify(json));
      } else {
        log('discarded messaged (not connected)');
      }
    };
    send(handshake());

    connection.on('error', function (error) {
      log("Connection Error: " + error.toString());
      setTimeout(connect, 1000);
    });
    connection.on('close', function () {
      log('Connection Closed');
      setTimeout(connect, 1000);
    });
    connection.on('message', function (message) {
      if (message.type === 'utf8') {
        log("Received: '" + message.utf8Data + "'");
      }
      var messageJSON = JSON.parse(message.utf8Data);
      var response = {
        id: messageJSON.id,
        type: 'http-response',
        statusCode: 200,
        headers: {
          'Server': 'fake device'
        },
        body: {
          echo: messageJSON
        }
      };
      connection.sendUTF(JSON.stringify(response));
    });
  });
  client.connect('ws://localhost:8080/', 'httpd');
};
connect();
