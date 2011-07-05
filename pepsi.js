#!/usr/bin/env node
require.paths.unshift('./node_modules/');
var config = require('./config');
var irc = require('irc');
var mailer = require('nodemailer');
var sqlite = require('sqlite3').verbose();
var dns = require('dns');
var ldap = require("LDAP");

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

pepsi.addListener('motd', function(motd) {
	if( config.user_modes ) {
		pepsi.send('MODE', pepsi.nick, config.user_modes);
	}

	if( config.nickserv_pass ) {
		pepsi.say("NickServ", config.nickserv_pass);
	}
});

pepsi.addListener('error', function(message) {
	console.error('ERROR: %s: %s', message.command, message.args.join(' '));
});

/* Memo stuff */
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

/* Our event listners */
pepsi.addListener('message', function (from, to, message) {
	console.log(from + ' => ' + to + ': ' + message);

	data = message.split(' ');
	if ( message.match(/^!cc/) ) {
		if ( data[1] ) {
			pepsi.say(to, data[1] + ': Here we encourage people to speak correctly to enhance intellectual exchange.  Please take the time to read: http://cluenet.org/wiki/Clueful_Chatting');
		}
	} else if ( message.match(/^!ccl/) ) {
		if ( data[1] ) {
			pepsi.say(to, data[1] + ': Your style of chatting demonstrates: low levels of intelligence, laziness, and general non-cluefulness.  Please read this article about text-based chatting: http://cluenet.org/wiki/Clueful_Chatting');
		}
	} else if ( message.match(/^!ccll/) ) {
		if ( data[1] ) {
			pepsi.say(to, data[1] + ': Your style of chatting seems quite unreadable. Please speak in English and please try to follow the rules in this article: http://cluenet.org/wiki/Clueful_Chatting');
		}
	} else if ( message.match(/^!cobi/) ) {
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
	} else if ( message.match(/^!cobimail/) ) {
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
	} else if ( message.match(/^!damian/) ) {
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
	} else if ( message.match(/^!memo/) ) {
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
	} else if ( message.match(/^!dns/) || message.match(/^!idns/) || message.match(/^!edns/) ) {
		try {
			if ( data[1] ) {
				if ( message.match(/^!idns/) ) {
					data[1] = data[1] + ".internal.cluenet.org";
				}
			
				if ( message.match(/^!edns/) ) {
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
	} else if ( message.match(/^!vdns/) ) {
		try {
			if ( data[1] ) {
				ldap = new ldap.Connection();
				if(ldap.open("ldap://ldap.cluenet.org ldap://ldap2.cluenet.org", 2) < 0) {
					pepsi.say(to, from + ': Sorry, I could not connect to ldap.');
					console.log("Could not connect to ldap.cluenet.org");
				}
				ldap.search("ou=servers,dn=cluenet,dn=org", ldap.ONELEVEL, "(cn=" + data[1] + ".cluenet.org)", "*", function(msgid, err, data) {
					console.log("(cn=" + data[1] + ".cluenet.org)");
					switch(err) {
						case -2:
							pepsi.say(to, from + ': Sorry, LDAP is MIA.');
							console.log("LDAP server timedout.");
						break;
						case -1:
							pepsi.say(to, from + ': Sorry, LDAP went for a walk.');
							console.log("LDAP server went away during search");
						break;
						default:
							if( data ) {
								console.log(data);
							} else {
								pepsi.say(to, from + ': Sorry, I could not find that in LDAP.');
								console.log("No data returned");
							}
						break;
					}
				});
				ldap.close()
			}
		} catch (err) {
			try {
				ldap.close();
			} catch (err) { }
			console.log('!idns failed: ' + err);
		}
	} else if ( message.match(/^!v6dns/) ) {
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
