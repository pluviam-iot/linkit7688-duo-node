var net = require('net');

var server = net.createServer(function(socket) {
  socket.on('data', function(data) {
    console.log('\n=Begin=');
    console.log(data.toString());
    console.log('=End=\n');

    socket.write('ACK');
  });
});


console.log('Listening on 0.0.0.0:3501');
server.listen(3501, '0.0.0.0');