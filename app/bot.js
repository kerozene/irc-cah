var  util = require('util'),
        _ = require('lodash'),
      irc = require('irc'),
utilities = require('./utilities.js'),
   Config = require('./controllers/config'),
    Decks = require('./controllers/decks'),
    Users = require('./controllers/users'),
      Cmd = require('./controllers/cmd');

/**
 * Initialize the bot
 */
var Bot = function Bot() {
    var self = this;

    self.controller = {};
    self.commands = [];
    self.decks = [];
    self.users = {};
    self.msgs = [];
    self.timers = [];

    self.maxServerSilence = 240;        // reconnect if nothing received for this long (s)
    self.lastServerRawReceived = 0;
    self.lastDevoiceOnJoin = {};
    self.lastCommandFromHost = {};

    self.controller.config = new Config(self);
    self.config = config = self.controller.config.load();

    self.nonUsers = self.config.nonUsers;

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
        self.controller.decks.loadDecks(config.decks);
    });

    self.controller.users = new Users(self);
    self.controller.users.init();
    setTimeout(function() {
        self.timers.storeUsers = setInterval(self.controller.users.storeAll, 5 * 60 * 1000);
    }, 10 * 1000); // 10 seconds after chanData refresh

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
                throw Error(util.format('Unknown handler: Cmd.%s', command.handler));
            _.each(command.commands, function(alias) {
                if (self.controller.cmd.findCommand(alias))
                    throw Error(util.format('Command alias already in use: %s', alias));
            });
            self.commands.push(command);
        });
    };

    /**
     * Don't die on uncaught errors
     */
    self.persevere = function() {
        process.on('uncaughtException', function (err) {
            self.log(util.format('Caught exception: %s', err));
            self.log(err.stack);
            client.say(self.channel, "WARNING: The bot has generated an unhandled error. Quirks may ensue.");
        });
    };

    self.shutdown = function(message) {
        if (message)
            self.client.say(self.channel, util.format('Shutting down: %s', message));
        if (self.game)
            self.game.stop();
        self.controller.users.storeAll();
        self.log(util.format('Shutting down: %s', message));
        client.disconnect(message, process.exit);
    };

    /**
     * Connect to server
     */
    self.connect = function() {
        self.log(util.format('Connecting to %s as %s...', config.server, config.nick));
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
            console.warn(util.format('Server has gone away since %s', self.lastServerRawReceived));
            clearInterval(self.timers.checkServer);
            self.reconnect();
        }
    };

    self.refreshUsers = function() {
        self.log('Refreshing user list...');
        setTimeout(function() {
            _.each(client.nicksInChannel(self.channel), function(nick) {
                if (client.nick != nick)
                    self.controller.users.updateUserFromNick(nick);
            });
        }, 200);
    };

    self.refreshChanData = function() {
        client.who(self.channel, '%cuhnfa');
    };

    /**
     * On joining a channel (syncchan event)
     * @param channel
     */
    self.channelJoinHandler = function(channel) {
        self.log('Joined ' + channel + ' as ' + client.nick);
        if (channel.toLowerCase() != self.channel) {
            self.log(util.format('Joined unknown channel %s, parting...', channel)); // maybe forwarded
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
        var cmd, cmdArr, cmdArgs = [],
            pickArr = text.trim().split(/[^\d\s]/)[0].match(/(\d+)/g); // get the numbers

        if (config.enableFastPick && !_.isNull(pickArr)) {
            cmd = self.controller.cmd.findCommand('pick');
            cmdArgs  = [pickArr, true]; // fastPick=true
        } else {
            var escape = ['-', '^'];
            var prefix = _.map(config.commandPrefixChars.split(''), function(char) {
                return (_.includes(escape, char)) ? "\\" + char : char;
            }).join('');
            var cmdPattern = new RegExp('^([' + prefix + '])?([^\\s]+)(?:\\s(.*))?', 'i');

            cmdArr = text.trim().match(cmdPattern);
            if ( !cmdArr || !cmdArr[2])
                return false;

            cmd = self.controller.cmd.findCommand(cmdArr[2].toLowerCase());
            if (  !cmd ||
                 ( cmd.noPrefix &&  cmdArr[1]) ||  // called as '.cmd' but prefix disallowed
                 (!cmd.noPrefix && !cmdArr[1]) ||  // called as  'cmd' but prefix required
                 ( cmd.noParams &&  cmdArr[3])     // called as '.cmd foo' but params disallowed
            )
                return false;

            if (cmdArr[3]) {
                cmdArgs = utilities.getMatches(cmdArr[3], /([^\s]+)\s?/gi, 1);
            }
        }

        if ( cmd.flag && !client.nickHasChanMode(message.nick, cmd.flag, self.channel) )
            return false;

        if ( !cmd.noThrottle &&
             !client.nickHasOp(message.nick, self.channel) &&
              self.throttleCommand(message)
        )
            return false;

        if (to.toLowerCase() == self.channel.toLowerCase()) {
            if (cmd.private) {
                self.client.notice(from, 'That command can only be used by private message.');
                return false;
            }
            message.private = false;
        } else {
            if (cmd.public) {
                self.log(util.format('%s tried to use public command "%s" in private', from, cmd.commands[0]));
                self.client.notice(from, 'That command can only be used in the channel.');
                return false;
            }
            message.private = true;
        }

        callback = function() { self.controller.cmd[cmd.handler](message, cmdArgs); };
        callback.call();
    };

    self.loadCommands();

    // handle connection to server for logging
    client.addListener('registered', function (message) {
        self.log(util.format('Connected to server %s', message.server));
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
        if (client.nick == nick || nick == 'ChanServ')
            return false;

        var user = self.controller.users.updateUserFromNick(nick);
        if (user && user.data.doNotPing === true)
            self.controller.cmd.back(message, [ 'ONJOIN' ]);

        if (config.userJoinCommands) {
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
            client.say(from, util.format('Attempting to join %s', channel));
            self.log(util.format('Attempting to join %s : invited by %s', channel, from));
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

    client.addListener('who' + self.channel, self.refreshUsers);
    self.timers.refreshChannel = setInterval(self.refreshChanData, 5 * 60 * 1000);

};

exports = module.exports = Bot;
