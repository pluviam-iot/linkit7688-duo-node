'use strict';

var mraa = require('mraa'); // require mraa
var uart = new mraa.Uart(0);

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

console.log('MRAA Version: ' + mraa.getVersion());
console.log('Set UART parameters');

uart.setBaudRate(9600);
uart.setMode(8, 0, 1);
uart.setFlowcontrol(false, false);
uart.setTimeout(10000, 10000, 5000);
sleep(200);
readUart();

while (true) {
	console.log('sending command: ' + String.fromCharCode(97));
	uart.writeStr(String.fromCharCode(97));
	sleep(1000);
	var readed = readUart();
	console.log(readed);
	sleep(200);
}
