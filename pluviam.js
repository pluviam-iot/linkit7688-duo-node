'use strict';

var serverUrl = 'backyard.pluvi.am';
var stationId = '59f3eaf328c6a2439fd1323a';
var token = 'wfho989ndg7kcs6c';
var FILE = '/pluviam/db/db';
var LINES_TO_GET = 10;

var CronJob = require('cron').CronJob;
var fs = require('fs');
var http = require('http');
var util = require('util');
var cp = require('child_process');
var mraa = require('mraa'); // require mraa
var uart = new mraa.Uart(0);
var sensorArray = ['date', 'temperature', 'humidity', 'pressure', 'battery', 'precipitaion', 'windSpeed', 'windDirection'];

var sensorHeader = '';

for (var i = 1; i < sensorArray.length; i++) {
	sensorHeader = sensorHeader + sensorArray[i] + ';';
}
sensorHeader = sensorHeader.substr(0, sensorHeader.length - 1);

function sleep (delay) {
	delay += new Date().getTime();
	while (new Date() < delay) {}
}

function readUart () {
	var result = '';
	while (uart.dataAvailable(0)) {
		result = result + uart.readStr(1);
	}
	return result;
}

function postSingle (json) {
	var url = '/stations/' + stationId;
	post(url, json);
}

function postBulk (json, isReSend, bytesLength) {
	var url = '/stations/' + stationId + '/bulk';
	post(url, json, isReSend, bytesLength);
}

function post (url, json, isReSend, bytesLength) {
//	console.log('****** Send Data');
//	console.log(json);
	var body = JSON.stringify(json);
	var options = {
		hostname: serverUrl,
		port: 80,
		path: url,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Content-Length': Buffer.byteLength(body),
			'X-Pluviam-Token': token
		}
	};
	var req = http.request(options, function (res) {
//		console.log('Status: ' + res.statusCode);
//		console.log('Headers: ' + JSON.stringify(res.headers));
		res.setEncoding('utf8');
		res.on('data', function (body) {
			if (res.statusCode === 200) {
				var bodyJson = JSON.parse(body);
				if (bodyJson.message === 'Success') {
					console.log('Success !!!!!');
					// failBackToFile(json);
					if (isReSend) {
						removeLastBytes(bytesLength, function () {
							console.log('REmoved last x lines');
						});
					} else {
						verifyFailBack();
					}
				} else {
					console.log('200 but Fail !!!!!');
					failBackToFile(json);
				}
			} else {
				console.log('Fail !!!!!');
				failBackToFile(json);
			}
			console.log('Body: ' + body);
		});
	});
	req.on('error', function (e) {
		console.log('problem with request: ' + e.message);
		failBackToFile(json);
	});
	// write data to request body
	req.write(body);
	req.end();
}

function jsonToFile (json) {
	var date = new Date();
	json.date = date.toISOString();
	var toFile = '';
	for (var i in sensorArray) {
		toFile = toFile + json[sensorArray[i]] + ';';
	}
	toFile = toFile.substr(0, toFile.length - 1) + '\n';
	return toFile;
}

// function fileToJson (line) {
// 	var lineArray = line.split(';');
// 	var json = {};
// 	for (var i in lineArray) {
// 		json[sensorArray[i]] = lineArray[i];
// 	}
// 	return json;
// }

function failBackToFile (json) {
	appendFile(jsonToFile(json));
}

function verifyFailBack () {
	getLastLines(LINES_TO_GET, function (lines, bytesLength) {
		var json = {};
		json.headers = sensorHeader;
		json.data = [];
		if (lines.length > 0) {
			console.log('lines' + lines);
			var lineArray = lines.split('\n');
			for (var i in lineArray) {
				var line = lineArray[i];
				if (line.length > 0) {
					json.data.push(line);
				}
			}
			var isResend = true;
			postBulk(json, isResend, bytesLength);
		} else {
			console.log('No failback');
		}
	});
}

function appendFile (line) {
	console.log(line);
	fs.appendFile(FILE, line, function (err) {
		if (err) {
			console.log(err);
			return;
		}
		console.log('The file was saved!');
	});
}

uart.setBaudRate(9600);
uart.setMode(8, 0, 1);
uart.setFlowcontrol(false, false);
uart.setTimeout(10000, 10000, 5000);
sleep(200);
readUart();

new CronJob('00 * * * * *', function () {
	console.log('--- ' + new Date());
	var json = {};

	uart.writeStr('A');
	sleep(1000);
	json.temperature = readUart();

	uart.writeStr('B');
	sleep(1000);
	json.humidity = readUart();

	uart.writeStr('C');
	sleep(1000);
	json.pressure = readUart();

        uart.writeStr('K');                                                                                                                                              
        sleep(1000);                                                                                                                                                     
        json.battery = readUart();
        
	uart.writeStr('I');                                                                 
        sleep(3000);                                                                        
        json.windSpeed = readUart();    

        uart.writeStr('E');                                                                 
        sleep(1000);                                                                        
        json.windDirection = processWindDir(readUart());

        uart.writeStr('D');                                                                 
        sleep(1000);                                                                        
        json.precipitation = readUart();    
	
	if (json.precipitation == "0") {
		json.precipitation = 0;	
	}
	
	uart.writeStr('H');
	postSingle(json);
}, null, true, 'America/Los_Angeles');

// new CronJob('10,20,30,40,50 * * * * *', function () {
// 	console.log('--- ' + new Date());
// 	uart.writeStr('A');
// 	sleep(1000);
// 	console.log('Temperature ' + readUart());
//
// 	uart.writeStr('B');
// 	sleep(1000);
// 	console.log('Humidity ' + readUart());
//
// 	uart.writeStr('C');
// 	sleep(1000);
// 	console.log('Pressure ' + readUart());
// }, null, true, 'America/Los_Angeles');

console.log('Started');

function getLastLines (linesToGet, callback) {
	var command = util.format('tail -n %d %s', linesToGet, FILE);
	cp.exec(command, function (err, stdout, stderr) {
		if (err) throw err;
		var bytesLength = stdout.length;
		return callback(stdout, bytesLength);
	});
}

function convertWindDirection (value) {
	if (1==1) {
		
	}
}

function removeLastBytes (bytesLength, callback) {
	fs.stat(FILE, function (err, stats) {
		if (err) throw err;
		fs.truncate(FILE, stats.size - bytesLength, function (err) {
			if (err) throw err;
			console.log('File truncated!');
			return callback();
		});
	});
}

function processWindDir(value) {
  var windDir = '-';
  if (value >= 44 && value <= 72) {
    windDir = "ESE";
  }
  else if (value >= 73 && value <= 86) {
    windDir = "ENE";
  }
  else if (value >= 87 && value <= 107) {
    windDir = "E";
  }
  else if (value >= 109 && value <= 147) {
    windDir = "SSE";
  }
  else if (value >= 164 && value <= 207) {
    windDir = "SE";
  }
  else if (value >= 224 && value <= 266) {
    windDir = "SSW";
  }
  else if (value >= 268 && value <= 310) {
    windDir = "S";
  }
  else if (value >= 385 && value <= 427) {
    windDir = "NNE";
  }
  else if (value >= 440 && value <= 482) {
    windDir = "NE";
  }
  else if (value >= 577 && value <= 614) {
    windDir = "WSW";
  }
  else if (value >= 615 && value <= 652) {
    windDir = "SW";
  }
  else if (value >= 683 && value <= 725) {
    windDir = "NNW";
  }
  else if (value >= 766 && value <= 807) {
    windDir = "N";
  }
  else if (value >= 808 && value <= 849) {
    windDir = "WNW";
  }
  else if (value >= 867 && value <= 909) {
    windDir = "NW";
  }
  else if (value >= 925 && value <= 929) {
    windDir = "W";
  }
  return windDir;
}

