var util = require('util'),
       _ = require('underscore'),
     irc = require('irc'),
  config = require('../config/config'),
   Games = require('../app/controllers/games.js'),
       p = config.commandPrefixChars[0],
  client = {};

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

    config.clientOptions['autoConnect'] = false;
    client = self.client = new irc.Client(config.server, config.nick, config.clientOptions);
    client.supported = _.extend(client.supported, config.supported);
    console.log('Configuration loaded.');

    self.cah = new Games();

    /**
     * Add a public command to the bot
     * @param cmd Command keyword
     * @param mode User mode that is allowed
     * @param callback
     */
    self.cmd = function (cmd, mode, callback) {
        self.commands.push({
            cmd: cmd,
            mode: mode,
            callback: callback
        });
    };

    /**
     * Add a msg command to the bot
     * @param cmd Command keyword
     * @param mode User mode that is allowed
     * @param callback
     */
    self.msg = function (cmd, mode, callback) {
        msgs.push({
            cmd: cmd,
            mode: mode,
            callback: callback
        });
    };

    /**
     * Add an irc event listener to the bot
     * @param event Client event
     * @param callback
     */
    self.listen = function (event, callback) {
        client.addListener(event, callback);
    };

    /**
     * Don't die on uncaught errors
     */
    self.persevere = function() {
        process.on('uncaughtException', function (err) {
            console.log('Caught exception: ' + err);
            console.log(err.stack);
            _.each(config.clientOptions.channels, function(channel) {
                client.say(channel, "WARNING: The bot has generated an unhandled error. Quirks may ensue.")
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
            if (game.channel && game.isRunning()) {
                game.pause();
        }
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
     * On joining a channel
     * @param channel
     */
    self.afterJoin = function(channel) {
        console.log('Joined ' + channel + ' as ' + client.nick);
        var game = self.cah.findGame(channel);
        if (game) {
            self.afterRejoin(channel, game);
        } else if (typeof config.joinCommands !== 'undefined' &&config.joinCommands.hasOwnProperty(channel) && config.joinCommands[channel].length > 0) {
            _.each(config.joinCommands[channel], function (cmd) {
                if(cmd.target && cmd.message) {
                    message = _.template(cmd.message)
                    client.say(cmd.target, message({nick: client.nick, channel: channel}).split('%%').join(p));
                }
            });
        }
        client.send('NAMES', channel);
    };

    /**
     * On rejoining a channel with an active game
     * @param channel
     * @param game
     */
    self.afterRejoin = function(channel, game) {
        if (game.isPaused()) {
            console.log('Rejoined ' + channel + ' where game is paused.');
            client.say(channel, util.format('Card bot is back! Type %sresume to continue the current game.', p));
            return true;
        }
        if (game.isRunning()) {
            console.warn('Error: Joined ' + channel + ' while game in progress');
            client.say(channel, 'Error: Joined while game in progress. Pausing...');
            game.pause();
            return false;
        }
        console.warn('Error: Joined ' + channel + ' while game in state: ' + game.state);
        return false;
    };

    /**
     * Devoice on join (NAMES)
     * @param channel
     * @param nicks
     */
    self.devoiceOnJoin = function(channel, nicks) {
        if (config.voicePlayers !== true) { return false; }
        var newTimestamp = _.now(),
            oldTimestamp = self.lastDevoiceOnJoin[channel];
        self.lastDevoiceOnJoin[channel] = newTimestamp;
        if (oldTimestamp && newTimestamp - oldTimestamp < 5000) { return false; }
        var nicks = _.keys( _.pick(nicks, function(nick) { return ( nick === '+' ) }) );
        var game = self.cah.findGame(channel);
        if (game) {
            var players = _.pluck(game.players, 'nick');
            nicks = _.difference(nicks, players);
        }
        var timeout = setTimeout(function() { // allow time to get ops
            var i, j, m = client.supported.modes, // number of modes allowed per line
                modes = '-' + new Array(m+1).join('v');
            for (i=0, j=nicks.length; i<j; i+=m) {
                var args = ['MODE', channel, modes].concat(nicks.slice(i, i+m));
                client.send.apply(this, args);
            }
            clearTimeout(timeout);
        }, 2000);
    };

    /**
     * Pause game if leaving a channel
     */
    self.channelLeaveHandler = function(channel, nick) {
        var game = self.cah.findGame(channel);
        if (client.nick == nick && game && game.isRunning()) {
            console.warn('Left channel ' + channel + ' while game in progress. Pausing...');
            game.pause();
        }
    };

    /**
     * Execute callback if user has the required mode-level
     * @param nick
     * @param channel
     * @param mode
     * @param callback
     */
    self.withUserModeLevel = function(nick, channel, mode, callback) {
        // node-irc lists user modes as hierarchical, so treat ops as voiced ops
        var allowedModes = {
            'o': ['@'],
            'v': ['+', '@'],
            '':  ['', '+', '@']
        };
        var checkMode = allowedModes[mode];
        if (typeof checkMode === 'undefined') {
            console.log('Invalid mode to check: ' + mode);
            return false;
        }
        var callbackWrapper = function(channel, nicks) {
            client.removeListener('names', callbackWrapper);
            // check if the found mode is one of the ones we're checking ('@' matches '@' or '+')
            var hasModeLevel = ( _.has(nicks, nick) && _.contains(checkMode, nicks[nick]) );
            if (hasModeLevel) {
                console.log('User ' + nick + ' has mode "' + mode + '" : executing callback ');
                callback.apply(this, arguments);
            }
        };
        client.addListener('names', callbackWrapper);
        client.send('NAMES', channel);
    };

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
        if (client.nick === nick) { // it's meee
            self.afterJoin(channel);
        }
        else if (typeof config.userJoinCommands !== 'undefined' && config.userJoinCommands.hasOwnProperty(channel) && config.userJoinCommands[channel].length > 0) {
            console.log("User '" + nick + "' joined " + channel);
            _.each(config.userJoinCommands[channel], function (cmd) {
                if(cmd.target && cmd.message) {
                    message = _.template(cmd.message)
                    client.say(cmd.target, message({nick: nick, channel: channel}).split('%%').join(p));
                }
            });
        }
    });

    client.addListener('names', self.devoiceOnJoin);

    // accept invites for known channels
    client.addListener('invite', function(channel, from, message) {
        if (_.contains(config.clientOptions.channels, channel) && ! _.contains(_.keys(client.chans, channel))) {
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

    client.addListener('part', self.channelLeaveHandler);
    client.addListener('kick', self.channelLeaveHandler);

    client.addListener('message', function (from, to, text, message) {
        console.log('message from ' + from + ' to ' + to + ': ' + text);
        // parse command
        var cmd, cmdArgs = [],
            pickArr = text.trim().split(/[^\d\s]/)[0].match(/(\d+)/g); // get the numbers
        if (config.enableFastPick && !_.isNull(pickArr)) {
            cmd      = 'pick';
            cmdArgs  = [pickArr, true]; // fastPick=true
        } else {
            var escape = ['-', '^'];
            var prefix = _.map(config.commandPrefixChars.split(''), function(char) {
                return (_.contains(escape, char)) ? "\\" + char : char;
            }).join('');
            var cmdPattern = new RegExp('^[' + prefix + ']([^\\s]+)\\s?(.*)$', 'i');
            var cmdArr = text.trim().match(cmdPattern);
            if (!cmdArr || cmdArr.length <= 1) {
                // command not found
                return false;
            }
            cmd = cmdArr[1].toLowerCase();
            // parse arguments
            cmdArgs = [];
            if (cmdArr.length > 2) {
                cmdArgs = _.map(cmdArr[2].match(/([^\s]+)\s?/gi), function (str) {
                    return str.trim();
                });
            }
        }
        // build callback options

        if (config.clientOptions.channels.indexOf(to) >= 0) {
            // public commands
            _.each(self.commands, function (c) {
                callback = function() { c.callback(client, message, cmdArgs); };
                if (cmd === c.cmd) {
                    console.log('command: ' + c.cmd);
                    // check user mode and execute callback
                    self.withUserModeLevel(message.nick, to, c.mode, callback);
                }
            }, this);
        } else if (client.nick === to) {
            // private message commands
            _.each(self.msgs, function (c) {
                callback = function() { c.callback(client, message, cmdArgs); };
                if (cmd === c.cmd) {
                    console.log('command: ' + c.cmd);
                    // check user mode and execute callback
                    //self.withUserModeLevel(message.nick, c.mode, callback);
                }
            }, this);
        }
    });

};

exports = module.exports = Bot;
