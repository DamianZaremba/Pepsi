#!/usr/bin/env node
require.paths.unshift('./node_modules/');
var config = require('./config');
var irc = require('irc');
var mailer = require('nodemailer');
var sqlite = require('sqlite3');
var dns = require('dns');
var ldap = require("LDAP");
var net = require("net");
var dgram = require('dgram')

/* IRC server stuff */
// User function - we use this with prototypes
function User(socket) {
	this.socket = socket;
	this.authenticated = false;
}

User.prototype.sendMessage = function (msg) {
	if (this.socket.readyState !== "open" && this.socket.readyState !== "writeOnly") {
		return false;
	}

	this.socket.write(msg + "\r\n", "utf8");
};

User.prototype.parse = function (message) {
	var parts = message.split(" ");
	var command = parts[0].toUpperCase();
	var data = parts.slice(1);

	if(!command || !data) {
		return;
	}

	switch (command) {
		case "PASS":
			if(data[0] == config.irc_serverpass) {
				this.authenticated = true;
				console.log(this.socket.remoteAddress + " authenticated!");
			} else {
				console.log(this.socket.remoteAddress + " provided an incorrect password");
				this.quit();
			}
		break;

		case "PRIVMSG":
			var message = data.splice(1).join(' ').slice(1);
			for(var i in config.irc_serverchannels) {
				var channel = config.irc_serverchannels[i];
				if(pepsi) {
					pepsi.say(channel, message);
				}
			}
		break;

		case "PING":
			this.sendMessage("PONG pepsi.damianzaremba.co.uk");
		break;

		case "NICK":
			this.sendMessage(" 001 " + data[0] + " ");
		break;

		case "QUIT":
			this.quit(data[0]);
		break;

		// We don't really care about these		
		case "JOIN":
		case "PART":
		case "USER":
		break;

		default:
			console.log(command);
			console.log(data);
		break;
	}
}

User.prototype.quit = function (msg) {
	if(!msg) msg = ''
	this.sendMessage('QUIT: ' + msg);
	this.socket.end();
};

// IRC server
irc_server = net.createServer(function (socket) {
	socket.setTimeout(30000);
	socket.setEncoding("utf8");
	var user = undefined;

	socket.on('connect', function() {
		console.log("Connection from " + socket.remoteAddress);
		user = new User(socket);
	});

	socket.on('end', function() {
		console.log("Lost connection from " + socket.remoteAddress);
	});

	var buffer = "";
	var i;
	socket.on('data', function(data) {
		buffer += data;

		while (i = buffer.indexOf("\n")) {
			if(i < 0) break;

			var message = buffer.slice(0, i);
			if (message.length > 512) {
				user.quit("flooding");
			} else {
				buffer = buffer.slice(i+1);
				user.parse(message);
			}
		}
	});
});

// RSD server
rsd_server = dgram.createSocket("udp4");

rsd_server.on('message', function(data, info) {
	parts = String(data).split(" ");

	if(parts[0] == config.rsd_serverpass) {
		console.log('Valid data from ' + info.address);
		parts = parts.slice(1)
		message = parts.join(" ");

		for(var i in config.rsd_serverchannels) {
			var channel = config.rsd_serverchannels[i];
			if(pepsi) {
				pepsi.say(channel, "RSD: " + message);
			}
		}
	} else {
		console.log('Invalid data from ' + info.address);
	}
});

/* Core stuff */
var memodb = new sqlite.Database("memo.db", function (err) {
	if( err ) {
		console.log('Could not open db: ' + err);
		throw error;
	}
});

memodb.run('CREATE TABLE memos ("id" INTEGER PRIMARY KEY,"from" varchar(2048),"to" varchar(2048),"time" bigint(80),"message" varchar(2048),"seen" tinyint(1) DEFAULT "0")', function (err) {
	if( err ) {
		console.log('Could not create db: ' + err)
	}
});

var pepsi = new irc.Client(config.irc_server, config.nickname, {
	debug: true,
	showErrors: true,
	password: config.password,
	userName: config.username,
	realName: config.realname,
	port: config.port,
	channels: config.channels,
});

// Start the IRC irc_server
irc_server.listen(config.irc_serverport);

// Start the RSD server
rsd_server.bind(config.rsd_serverport);

/* Memo functions */
function send_memos(nick, channel) {
	if ( ! nick ) {
		return;
	}
	nick = nick.toLowerCase();
	memodb.each("SELECT * FROM `memos` WHERE `to` = $nick AND `seen` = 0", {1: nick}, function (err, row) {
		if ( err ) {
			console.log("Could not check for new memos: " + err);
		} else {
			var date = new Date();
			date.setTime( row.time * 1000 );
			date_str = date.toUTCString();

			memodb.run("UPDATE `memos` SET `seen` = 1 WHERE `id` = $id", {1: row.id});
			pepsi.say(channel, nick + ': New memo from ' + row.from + ' at ' + date_str + ': ' + row.message);
		}
	});
}

/* Our memo event listners */
pepsi.addListener('notice', send_memos);
pepsi.addListener('message', send_memos);

/* Bot event listeners */
pepsi.addListener('motd', function(motd) {
	if( config.user_modes ) {
		pepsi.send('MODE', pepsi.nick, config.user_modes);
	}

	if( config.nickserv_pass ) {
		pepsi.say("NickServ", "IDENTIFY " + config.nickserv_pass);
	}
});

pepsi.addListener('error', function(message) {
	console.error('ERROR: %s: %s', message.command, message.args.join(' '));
});
pepsi.addListener('message', function (from, to, message) {
	console.log(from + ' => ' + to + ': ' + message);

	data = message.split(' ');
	if ( data[0] == "!cc" ) {
		if ( data[1] ) {
			pepsi.say(to, data[1] + ': Here we encourage people to speak correctly to enhance intellectual exchange.  Please take the time to read: http://cluenet.org/wiki/Clueful_Chatting');
		}
	} else if ( data[0] == "!ccl" ) {
		if ( data[1] ) {
			pepsi.say(to, data[1] + ': Your style of chatting demonstrates: low levels of intelligence, laziness, and general non-cluefulness.  Please read this article about text-based chatting: http://cluenet.org/wiki/Clueful_Chatting');
		}
	} else if ( data[0] == "!ccll" ) {
		if ( data[1] ) {
			pepsi.say(to, data[1] + ': Your style of chatting seems quite unreadable. Please speak in English and please try to follow the rules in this article: http://cluenet.org/wiki/Clueful_Chatting');
		}
	} else if ( data[0] == "!cobi" ) {
		try {
			if ( data[1] ) {
				mailer.send_mail({
					sender: from + "@irc.cluenet.org",
					to: "9194268602@messaging.sprintpcs.com",
					subject: from + " wants you on " + to,
					body: data.slice(1).join(" "),
					}, function(err, result){
						if( err ) {
							pepsi.say(to, from + ': Sorry I could not send your message :(');
							console.log('Mail could not be sent: ' + err);
						} else {
							pepsi.say(to, from + ': Cobi hailed!');
							console.log('Mail sent ' + from + ': ' + data.slice(1).join(" "));
						}
					}
				);
			}
		} catch (err) {
			console.log("!memo failed: " + err);
		}
	} else if ( data[0] == "!cobimail" ) {
		try {
			if ( data[1] ) {
				mailer.send_mail({
					sender: from + "@irc.cluenet.org",
					to: "cobi@cluenet.org",
					subject: from + " wants you on " + to,
					body: data.slice(1).join(" "),
					}, function(err, result){
						if( err ) {
							pepsi.say(to, from + ': Sorry I could not send your message :(');
							console.log('Mail could not be sent: ' + err);
						} else {
							pepsi.say(to, from + ': Cobi hailed!');
							console.log('Mail sent ' + from + ': ' + data.slice(1).join(" "));
						}
					}
				);
			}
		} catch (err) {
			console.log("!memo failed: " + err);
		}
	} else if ( data[0] == "!damian" ) {
		try {
			if ( data[1] ) {
				mailer.send_mail({
					sender: from + "@irc.cluenet.org",
					to: "damian@damianzaremba.co.uk",
					body: data.slice(1).join(" "),
					}, function(err, result){
						if( err ) {
							pepsi.say(to, from + ': Sorry I could not send your message.');
							console.log('Mail could not be sent: ' + err);
						} else {
							pepsi.say(to, from + ': Damian hailed!');
							console.log('Mail sent ' + from + ': ' + data.slice(1).join(" "));
						}
					}
				);
			}
		} catch (err) {
			console.log("!memo failed: " + err);
		}
	} else if ( data[0] == "!memo" ) {
		try {
			if ( data[1] && data[2] ) {
				var time = new Date;
				time = time.getTime();
				time = time / 1000;

				memodb.run('INSERT INTO memos ("id", "from", "to", "time", "message") VALUES (NULL, $from, $to, $time, $message)', {1: from, 2: data[1].toLowerCase(), 3: time, 4: data.slice(2).join(" ")}, function (err) {
					if ( err ) {
						pepsi.say(to, from + ': Sorry I could not store your memo.');
						console.log("Could not store memo: " + err);
					} else {
						pepsi.say(to, from + ': Memo stored!');
						console.log("Memo stored: " + from + ' => ' + to + ': ' + data.slice(2).join(" "));
					}
				});
			}
		} catch (err) {
			console.log("!memo failed: " + err);
		}
	} else if ( data[0] == "!dns" || data[0] == "!idns" || data[0] == "!edns" ) {
		try {
			if ( data[1] ) {
				if ( data[0] == "!idns" ) {
					data[1] = data[1] + ".internal.cluenet.org";
				}
			
				if ( data[0] == "!edns" ) {
					data[1] = data[1] + ".external.cluenet.org";
				}
			
				dns.resolve4(data[1], function (err, addresses) {
					if( err ) {
						pepsi.say(to, from + ': Sorry I could not resolve ' + data[1]);
						console.log("Failed to resolved " + data[1] + " for " + from);
					} else {
						pepsi.say(to, from + ': ' + data[1] + ' => ' + addresses.join(', '));
						console.log("Resolved " + data[1] + " for " + from);
					}
				});
			}
		} catch (err) {
			console.log('!dns failed: ' + err);
		}
	} else if ( data[0] == "!vdns" ) {
		try {
			if ( data[1] ) {
				ldap = new ldap.Connection();
				if(ldap.open("ldap://ldap.cluenet.org", 3) < 0) {
					console.log("Could not connect to LDAP");
					pepsi.say(to, from + ': Sorry, I could not connect to LDAP');
				} else {
					console.log( "ou=servers,dc=cluenet,dc=org" );
					console.log( "(cn=" + data[1] + ".cluenet.org)" );
					console.log( "*" );

					ldap.search("ou=servers,dc=cluenet,dc=org", ldap.DEFAULT, "(cn=" + data[1] + ".cluenet.org)", "*", 
					function(id, err, result) {
						if( err ) {
							pepsi.say(to, from + ': Sorry, an error occurred: ' + err.message);
							console.log( err.message );
						} else {
							if( result.length == 0 ) {
								pepsi.say(to, from + ': Sorry, I could not find that irc_server');
							} else {
								console.log( result );
							}
						}
					});
				}
				ldap.close()
			}
		} catch (err) {
			console.log('!vdns failed: ' + err);
		}
	} else if ( data[0] == "!v6dns" ) {
		try {
			if ( data[1] ) {
				dns.resolve6(data[1], function (err, addresses) {
					if( err ) {
						pepsi.say(to, from + ': Sorry I could not resolve ' + data[1]);
						console.log("Failed to resolved " + data[1] + " for " + from);
					} else {
						pepsi.say(to, from + ': ' + data[1] + ' => ' + addresses.join(', '));
						console.log("Resolved " + data[1] + " for " + from);
					}
				});
			}
		} catch (err) {
			console.log('!v6dns failed: ' + err);
		}
	}	
});

pepsi.addListener('pm', function(nick, message) {
	console.log('Got private message from %s: %s', nick, message);
	pepsi.say('#damian', 'Got PM from ' + nick + ': ' + message);
});
