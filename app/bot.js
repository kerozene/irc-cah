var  util = require('util'),
        _ = require('lodash'),
      irc = require('irc'),
utilities = require('./utilities.js'),
   Config = require('./controllers/config'),
    Decks = require('./controllers/decks'),
      Cmd = require('./controllers/cmd');

/**
 * Initialize the bot
 */
var Bot = function Bot() {
    var self = this;

    self.controller = {};
    self.commands = [];
    self.decks = [];
    self.msgs = [];
    self.timers = [];

    self.maxServerSilence = 240;        // reconnect if nothing received for this long (s)
    self.lastServerRawReceived = 0;
    self.lastDevoiceOnJoin = {};
    self.lastCommandFromHost = {};

    self.controller.config = new Config(self);
    self.config = config = self.controller.config.load();

    /**
     * Logger
     */
    self.log = function(message, level) {
        // TODO implement levels
        util.log(message);
    };

    /**
     * Logger
     */
    self.warn = function(message, level) {
        // TODO implement levels
        console.error(message);
    };

    self.controller.decks = new Decks(self);
    self.controller.decks.init()
    .then(function(message) {
        self.log(message);
        _.each(config.decks, function(deck) {
            self.controller.decks.fetchDeck(deck)
            .then(function(data) {
                self.decks.push(data);
                var pad = function(str, char, width) {
                    var padded = new Array(width + 1).join(char) + str;
                    return padded.slice(-width);
                };
                self.log(util.format.apply(null, [ 'Enabled deck %s: %s questions %s answers', data.code ].concat(
                    _.map([ data.calls.length, data.responses.length ], function(el) { return pad(el, ' ', 4); })
                )));
            }, function(error) {
                if (error.name === 'NotFoundError')
                    error.message = error.message.split('/').reverse()[0];
                self.log(error.name + ': ' + error.message);
            });
        });
    });

    self.channel = config.channel.toLowerCase();
    config.clientOptions.channels = [ self.channel ];
    config.clientOptions.autoConnect = false;

    self.log('Configuration loaded.');

    self.client = client = new irc.Client(config.server, config.nick, config.clientOptions);

    self.controller.cmd = new Cmd(self);

    var p = config.commandPrefixChars[0];

    /**
     * Load game commands from config
     */
    self.loadCommands = function() {
        _.each(config.commands, function(command) {
            if (!self.controller.cmd[command.handler])
                throw Error('Unknown handler: Cmd.' + command.handler);
            _.each(command.commands, function(alias) {
                if (self.controller.cmd.findCommand(alias))
                    throw Error('Command alias already in use: ' + alias);
            });
            self.commands.push(command);
        });
    };

    /**
     * Don't die on uncaught errors
     */
    self.persevere = function() {
        process.on('uncaughtException', function (err) {
            self.log('Caught exception: ' + err);
            self.log(err.stack);
            client.say(self.channel, "WARNING: The bot has generated an unhandled error. Quirks may ensue.");
        });
    };

    /**
     * Connect to server
     */
    self.connect = function() {
        self.log('Connecting to ' + config.server + ' as ' + config.nick + '...');
        client.connect(function() {
            self.log('Connected.');
            if (typeof config.exitOnError !== "undefined" && config.exitOnError === false) {
                self.persevere();
            }
        });
    };

    /**
     * Reconnect to the server
     * @param retryCount
     */
    self.reconnect = function(retryCount) {
        retryCount = retryCount || config.clientOptions.retryCount;
        clearInterval(self.timers.checkServer);
        console.warn('Trying to reconnect...');
        if (self.game && self.game.isRunning())
            game.pause();
        client.disconnect('Reconnecting...');
        setTimeout(function() { // Waiting for disconnect to call back doesn't work
            console.warn('Connecting...');
            client.connect(retryCount);
        }, 5000);
    };

    /**
     * Try to reconnect if server goes silent
     */
    self.checkServer = function() {
        if (_.now() - self.lastServerRawReceived > self.maxServerSilence * 1000) {
            console.warn('Server has gone away since ' + self.lastServerRawReceived);
            clearInterval(self.timers.checkServer);
            self.reconnect();
        }
    };

    /**
     * On joining a channel (syncchan event)
     * @param channel
     */
    self.channelJoinHandler = function(channel) {
        self.log('Joined ' + channel + ' as ' + client.nick);
        if (channel.toLowerCase() != self.channel) {
            self.log('Joined unknown channel ' + channel + ', parting...'); // maybe forwarded
            client.part(channel, 'nope nope nope');
            return false;
        }
        self.devoiceOnJoin(channel);
        if (  !self.game && config.joinCommands ) {
            _.each(config.joinCommands, function (cmd) {
                if (cmd.target && cmd.message) {
                    message = _.template(cmd.message)({nick: client.nick, channel: channel}).split('%%').join(p);
                    client.say(cmd.target, message);
                }
            });
        }
    };

    /**
     * Devoice on join
     * @param channel
     */
    self.devoiceOnJoin = function(channel) {
        if (config.voicePlayers !== true)
            return;
        var newTimestamp = _.now(),
            oldTimestamp = self.lastDevoiceOnJoin[channel];
        self.lastDevoiceOnJoin[channel] = newTimestamp;
        if (oldTimestamp && newTimestamp - oldTimestamp < 5000)
            return;
        var game = self.game;
        var players = (game) ? game.getPlayerNicks()
                             : [];
        var nicks   = _.difference(client.nicksWithVoice(channel), players);
        client.setChanMode(channel, '-v', nicks);
    };

    self.throttleCommand = function(message) {
        var now      = _.now(),
            host     = message.host,
            last     = self.lastCommandFromHost[host],
            throttle = config.commandThrottle;

        if ( last === undefined || last[0] < (now - throttle[1] * 1000) ) {
            self.lastCommandFromHost[host] = [now, 1];
            return false;
        }
        else {
            last[0] = now;
            last[1]++;
            self.lastCommandFromHost[host] = last;
        }
        if (last[1] === throttle[0])
            client.notice(message.nick, util.format(
                'That\'s %s commands in %s seconds. Wait %s seconds before next command.',
                throttle[0], throttle[1], throttle[1]));
        return (last[1] > throttle[0]);
    };

    self.messageHandler = function (from, to, text, message) {
        // parse command
        var cmd, cmdArgs = [],
            pickArr = text.trim().split(/[^\d\s]/)[0].match(/(\d+)/g); // get the numbers
        if (config.enableFastPick && !_.isNull(pickArr)) {
            cmd = self.controller.cmd.findCommand('pick');
            cmdArgs  = [pickArr, true]; // fastPick=true
        } else {
            var escape = ['-', '^'];
            var prefix = _.map(config.commandPrefixChars.split(''), function(char) {
                return (_.includes(escape, char)) ? "\\" + char : char;
            }).join('');
            var cmdPattern = new RegExp('^[' + prefix + ']([^\\s]+)(?:\\s(.*))?', 'i');
            var cmdArr = text.trim().match(cmdPattern);
            if (!cmdArr || cmdArr.length <= 1) {
                // command not found
                return false;
            }
            cmd = self.controller.cmd.findCommand(cmdArr[1].toLowerCase());
            if (!cmd)
                return false;
            // parse arguments
            if (cmdArr[2])
                cmdArgs = utilities.getMatches(cmdArr[2], /([^\s]+)\s?/gi, 1);
        }

        // build callback options
        if (to.toLowerCase() == self.channel) {
            // public command
            callback = function() { self.controller.cmd[cmd.handler](message, cmdArgs); };
            if (!cmd.flag || client.nickHasChanMode(message.nick, cmd.flag, self.channel)) {
                if (!self.throttleCommand(message))
                    callback.call();
            }
        }
    };

    self.loadCommands();

    // handle connection to server for logging
    client.addListener('registered', function (message) {
        self.log('Connected to server ' + message.server);
        // start server monitor
        self.timers.checkServer = setInterval(self.checkServer, self.maxServerSilence * 1000);
        // Send connect commands after joining a server
        if (typeof config.connectCommands !== 'undefined' && config.connectCommands.length > 0) {
            _.each(config.connectCommands, function (cmd) {
                if(cmd.target && cmd.message) {
                    client.say(cmd.target, cmd.message);
                }
            });
        }
    });

    // handle user joins to channel
    client.addListener('join', function (channel, nick, message) {
        if ( client.nick !== nick && config.userJoinCommands ) {
            _.each(config.userJoinCommands, function (cmd) {
                if(cmd.target && cmd.message) {
                    message = _.template(cmd.message)({nick: nick, channel: channel}).split('%%').join(p);
                    client.say(cmd.target, message);
                }
            });
        }
    });

    // accept invites to configured channel
    client.addListener('invite', function(channel, from, message) {
        if (  channel.toLowerCase() == self.channel &&
            ! _.includes(_.keys(client.chans, channel)) ) {
            client.send('JOIN', channel);
            client.say(from, 'Attempting to join ' + channel);
            self.log('Attempting to join ' + channel + ' : invited by ' + from);
        }
    });

    // output errors
    client.addListener('error', function (message) {
        console.warn('IRC client error: ', message);
    });

    // try to reconnect on network errors
    client.addListener('netError', function(message) {
        console.warn('IRC network error: ', message);
        clearInterval(self.timers.checkServer);
        self.reconnect();
    });

    // update server monitor for checkServer()
    client.addListener('raw', function(message) {
        self.lastServerRawReceived = _.now();
    });

    client.addListener('joinsync', self.channelJoinHandler);
    client.addListener('message',  self.messageHandler);

};

exports = module.exports = Bot;
