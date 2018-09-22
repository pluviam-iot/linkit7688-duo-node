'use strict';

var FILE = '/pluviam/db/db.txt';
var LINES_TO_GET = 60;
var INTERVAL = 60000;

var net = require('net');
var config  = require('./config');
var fs = require('fs');
var util = require('util');
var cp = require('child_process');
var mraa = null;
var uart = null;
var isDevelopment = false;
try {
  mraa = require('mraa');
  uart = new mraa.Uart(0);
} catch (error) {
  console.log('===== DEVELOPMENT MODE ===== ');
  isDevelopment = true;
  INTERVAL = 5000;
  FILE = './db/db.txt';
}
var thereIsDataToSend = false;
if (!isDevelopment && config.interval) {
  INTERVAL = config.interval;
}

// Read data from Arduino
function readUart() {
  var result = '';
  if (isDevelopment) {
    result = '20.1;90;1000;11.1;180;8;10\n'
  } else {
    while (uart.dataAvailable(200)) {
      var byteRead = uart.readStr(1);
      result = result + byteRead;
    }
  }

  // This is necessary because sometimes there are some old bytes in the buffer of arduino 
  var splited = result.split('\n');
  if (splited.length > 1) {
    return Date.now() + ';' + splited[splited.length - 2] + '\n';
  }
}


// Send data to server
// If there are some data in the txt file, this data is read and send together
function sendData(dataToSend) {

  // add stationId
  dataToSend = config.stationId + '\n' + dataToSend;

  return new Promise(function(resolve, reject) {
    var isClose = false;
    var client = new net.Socket();
    var dataFile = '';
    client.connect(3501, isDevelopment ? '127.0.0.1' : config.serverUrl, function() {
      console.log('[Socket] Connected');
      if (thereIsDataToSend) {
        getLastLines(LINES_TO_GET).then(function(linesToSend) {
          console.log('[Socket] Send txt data together');
          dataFile = linesToSend;
          dataToSend += linesToSend;
          client.write(dataToSend);
        }).catch(function(_error) {
          client.write(dataToSend);
        });
      } else {
        client.write(dataToSend);
      }
    });
    
    client.on('data', function(data) {
      isClose = true;
      var success = data.toString() === 'ACK';
      if (success) {
        if (thereIsDataToSend) {
          removeLastBytes(dataFile.length).then(resolve).catch(reject);
        } else {
          resolve();
        }
      } else {
        reject();
      }
      client.destroy();
    });

    client.on('error', reject);
    
    // Timeout
    setTimeout(function() {
      if (!isClose) {
        reject('TIMEOUT');
        client.destroy();
      }
    }, 5000);
  });
}

function tryToSend(data) {
  sendData(data).then(function() {
    console.log('[Socket] Send success');
  }).catch(function(error) {
    thereIsDataToSend = true;
    console.log('[Socket] Send error' + error);
    appendFile(data);
  });
}

function appendFile(line) {
  console.log('[AppendFile] ' + line);
  fs.appendFile(FILE, line, function (err) {
    if (err) {
      console.log(err);
      return;
    }
  });
}

//this function use external command because it is much faster (when file is big)
function getLastLines(linesToGet) {
  var command = util.format('tail -n %d %s', linesToGet, FILE);
  return new Promise(function(resolve, reject) {
    cp.exec(command, function (err, stdout, stderr) {
      if (err) reject(err);
      var bytesLength = stdout.length;
      resolve(stdout, bytesLength);
    });
  });
}

//truncate file to remove what was sent
function removeLastBytes(bytesLength) {
  return new Promise(function(resolve, reject) {
    fs.stat(FILE, function (err, stats) {
      if (err) reject(err);
      fs.truncate(FILE, stats.size - bytesLength, function(err) {
        if (err) reject(err);
        resolve();
      });
    });
  });
}

function readUartAndSend() {
  console.log('---> ' + new Date());
  if (!isDevelopment) {
    uart.writeStr('A');
  }
  var result = readUart();
  tryToSend(result);  
}

function init() {
  console.log('Started ' + new Date());	

  if (!isDevelopment) {
    uart.setBaudRate(9600);
    uart.setMode(8, 0, 1);
    uart.setFlowcontrol(false, false);
    uart.setTimeout(10000, 10000, 5000);
  }

  readUartAndSend();

  var intervalDelay = INTERVAL;
  intervalDelay += new Date().getTime();
  
  setInterval(function() {
    if (new Date() > intervalDelay) {
      intervalDelay += INTERVAL;
      readUartAndSend();
    }
  }, 1000);
}

// Check if there are data in the failback file
try {
  var stats = fs.statSync(FILE);
  thereIsDataToSend = stats.size > 0;
  console.log('thereIsDataToSend ' + sendDataFile);
} catch(error) {}

// Clear buffer
readUart();

var dateReference = new Date();
var msWaitToInitialize = 1000 * (60 - dateReference.getSeconds());
if (isDevelopment) {
  msWaitToInitialize = 0;
}
console.log('Now is ' + dateReference + ' Wait ' + (msWaitToInitialize / 1000.0) + 's to initialize!');
setTimeout(init, msWaitToInitialize);
