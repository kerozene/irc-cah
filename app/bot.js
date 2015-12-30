var  util = require('util'),
        _ = require('underscore'),
      irc = require('irc'),
   Config = require('./controllers/config'),
    Decks = require('./controllers/decks'),
      Cmd = require('./controllers/cmd');

/**
 * Initialize the bot
 */
var Bot = function Bot() {
    var self = this;

    self.config = config;
    self.commands = [];
    self.msgs = [];
    self.timers = [];

    self.maxServerSilence = 240;        // reconnect if nothing received for this long (s)
    self.lastServerRawReceived = 0;
    self.lastDevoiceOnJoin = {};
    self.lastCommandFromHost = {};

    config.clientOptions.autoConnect = false;
    client = self.client = new irc.Client(config.server, config.nick, config.clientOptions);
    console.log('Configuration loaded.');

    self.cah = new Games();

    /**
     * Get the command data associated with 'alias'
     */
    self.findCommand = function(alias) {
        return _.find(self.commands, function(cmd) { return (_.contains(cmd.commands, alias)); });
    };

    /**
     * Load game commands from config
     */
    self.loadCommands = function() {
        _.each(config.commands, function(command) {
            if (!self.cah[command.handler])
                throw Error('Unknown handler: Games.' + command.handler);
            _.each(command.commands, function(alias) {
                if (self.findCommand(alias))
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
            console.log('Caught exception: ' + err);
            console.log(err.stack);
            _.each(config.clientOptions.channels, function(channel) {
                client.say(channel, "WARNING: The bot has generated an unhandled error. Quirks may ensue.");
            });
        });
    };

    /**
     * Connect to server
     */
    self.connect = function() {
        console.log('Connecting to ' + config.server + ' as ' + config.nick + '...');
        client.connect(function() {
            console.log('Connected.');
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
        _.each(self.cah.games, function(game) {
            if (game.channel && game.isRunning())
                game.pause();
        });
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
        console.log('Joined ' + channel + ' as ' + client.nick);
        self.devoiceOnJoin(channel);
        if (  !self.cah.findGame(channel) &&
               typeof config.joinCommands !== 'undefined' &&
               config.joinCommands[channel]
        ) {
            _.each(config.joinCommands[channel], function (cmd) {
                if(cmd.target && cmd.message) {
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
        var game = self.cah.findGame(channel);
        var players = (game) ? game.getPlayerNicks()
                             : [];
        var nicks   = _.difference(client.nicksWithVoice(channel), players);
        client.setChanMode(channel, '-v', nicks);
    };

    self.throttleCommand = function(host) {
        var now      = _.now(),
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
        return (last[1] > throttle[0]);
    };

    self.messageHandler = function (from, to, text, message) {
        // parse command
        var cmd, cmdArgs = [],
            pickArr = text.trim().split(/[^\d\s]/)[0].match(/(\d+)/g); // get the numbers
        if (config.enableFastPick && !_.isNull(pickArr)) {
            cmd = self.findCommand('pick');
            cmdArgs  = [pickArr, true]; // fastPick=true
        } else {
            var escape = ['-', '^'];
            var prefix = _.map(config.commandPrefixChars.split(''), function(char) {
                return (_.contains(escape, char)) ? "\\" + char : char;
            }).join('');
            var cmdPattern = new RegExp('^[' + prefix + ']([^\\s]+)(?:\\s(.*))?', 'i');
            var cmdArr = text.trim().match(cmdPattern);
            if (!cmdArr || cmdArr.length <= 1) {
                // command not found
                return false;
            }
            cmd = self.findCommand(cmdArr[1].toLowerCase());
            if (!cmd)
                return false;
            // parse arguments
            cmdArgs = [];
            if (cmdArr[2]) {
                cmdArgs = _.map(cmdArr[2].match(/([^\s]+)\s?/gi), function (str) {
                    return str.trim();
                });
            }
        }

        // build callback options
        if (config.clientOptions.channels.indexOf(to) >= 0) {
            var channel = to;
            // public commands
            callback = function() { self.cah[cmd.handler](client, message, cmdArgs); };
            if (!cmd.flag || client.nickHasChanMode(message.nick, cmd.flag, channel)) {
                if (!self.throttleCommand(message.host))
                    callback.call();
            }
        }
    };

    self.loadCommands();

    // handle connection to server for logging
    client.addListener('registered', function (message) {
        console.log('Connected to server ' + message.server);
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

    // handle joins to channels
    client.addListener('join', function (channel, nick, message) {
        if (client.nick === nick)
            return false;
        if (  typeof config.userJoinCommands !== 'undefined' &&
              config.userJoinCommands[channel]
           ) {
            _.each(config.userJoinCommands[channel], function (cmd) {
                if(cmd.target && cmd.message) {
                    message = _.template(cmd.message)({nick: nick, channel: channel}).split('%%').join(p);
                    client.say(cmd.target, message);
                }
            });
        }
    });

    // accept invites for known channels
    client.addListener('invite', function(channel, from, message) {
        if (  _.contains(config.clientOptions.channels, channel) &&
            ! _.contains(_.keys(client.chans, channel)) ) {
            client.send('JOIN', channel);
            client.say(from, 'Attempting to join ' + channel);
            console.log('Attempting to join ' + channel + ' : invited by ' + from);
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
