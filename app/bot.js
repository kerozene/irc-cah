var util = require('util'),
    _ = require('underscore'),
    irc = require('irc'),
    config = require('../config/config'),
    Games = require('../app/controllers/games.js'),
    client,
    commands = [],
    msgs = [],
    p = config.commandPrefixChars[0];

/**
 * Initialize the bot
 */
exports.init = function () {
    var self = this;

    var self.maxServerSilence = 240        // reconnect if nothing received for this long (s)
    var self.lastServerRawReceived = 0;
    var self.timers = [];

    console.log('Initializing...');
    // init irc client
    console.log('Connecting to ' + config.server + ' as ' + config.nick + '...');
    exports.client = client = new irc.Client(config.server, config.nick, config.clientOptions);
    _.extend(client.supported, config.supported);

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
        if (config.voicePlayers === true) {
            // create an event handler for each channel to devoice nicks when the bot joins
            _.each(config.clientOptions.channels, function(joinedChannel) {
                var devoiceOnJoin = function(nicks) {
                    client.removeListener('names' + joinedChannel, devoiceOnJoin);
                    // get voiced nicks
                    nicks = _.keys( _.pick(nicks, function(nick) { return ( nick === '+' ) }) );
                    var timeout = setInterval(function() {
                        var i, j, m = client.supported.modes, // number of modes allowed per line
                            modes = '-' + new Array(m).join('v');
                        for (i=0, j=nicks.length; i<j; i+=m) {
                            var args = ['MODE', joinedChannel, modes].concat(nicks.slice(i, i+m));
                            client.send.apply(this, args);
                        }
                        clearInterval(timeout);
                    }, 2000);
                };
                client.addListener('names' + joinedChannel, devoiceOnJoin);
            });
        }
    });

    // handle joins to channels
    client.addListener('join', function (channel, nick, message) {
        client.send('NAMES', channel);
        if (client.nick === nick) { // it's meee
            console.log('Joined ' + channel + ' as ' + nick);
            var game = _.findWhere(self.cah.games, {channel: channel});
            if (game) {
                if (game.state == game.STATES.PAUSED) {
                    console.log('Rejoined ' + channel + ' where game is paused.');
                    client.say(channel, util.format('Card bot is back! Type %sresume to continue the current game.', p));
                } else {
                    console.warn('Error: Joined ' + channel + ' while game in progress');
                    client.say(channel, 'Error: Joined while game in progress. Pausing...');
                    game.pause();
                }
            }
            if (typeof config.joinCommands !== 'undefined' &&config.joinCommands.hasOwnProperty(channel) && config.joinCommands[channel].length > 0) {
                _.each(config.joinCommands[channel], function (cmd) {
                    if(cmd.target && cmd.message) {
                        message = _.template(cmd.message)
                        client.say(cmd.target, message({nick: nick, channel: channel}).split('%%').join(p));
                    }
                });
            }
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
            _.each(commands, function (c) {
                callback = function() { c.callback(client, message, cmdArgs); };
                if (cmd === c.cmd) {
                    console.log('command: ' + c.cmd);
                    // check user mode and execute callback
                    self.withUserModeLevel(message.nick, to, c.mode, callback);
                }
            }, this);
        } else if (client.nick === to) {
            // private message commands
            _.each(msgs, function (c) {
                callback = function() { c.callback(client, message, cmdArgs); };
                if (cmd === c.cmd) {
                    console.log('command: ' + c.cmd);
                    // check user mode and execute callback
                    //self.withUserModeLevel(message.nick, c.mode, callback);
                }
            }, this);
        }
    });

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
    }

    self.reconnect = function(retryCount) {
        retryCount = retryCount || config.clientOptions.retryCount;
        clearInterval(self.timers.checkServer);
        console.warn('Trying to reconnect...');
        _.each(self.cah.games, function(game) {
            if (game.channel && game.state !== game.STATES.PAUSED) { game.pause(); }
        });
        client.disconnect('Reconnecting...', function() {
            console.warn('Disconnected. Connecting...');
            client.connect(retryCount);
        });
    }

    // try to reconnect if server goes silent
    self.checkServer = function() {
        if (_.now() - self.lastServerRawReceived > self.maxServerSilence * 1000) {
            console.warn('Server has gone away since ' + self.lastServerRawReceived);
            clearInterval(self.timers.checkServer);
            self.reconnect();
        }
    }

    // pause game if leaving a channel
    self.channelLeaveHandler = function(channel, nick) {
        var game = _.findWhere(self.cah.games, {channel: channel});
        if (client.nick == nick && game) {
            console.warn('Left channel ' + channel + ' while game in progress. Pausing...');
            game.pause();
        }
    }

    // don't die on uncaught errors
    if (typeof config.exitOnError !== "undefined" && config.exitOnError === false) {
        process.on('uncaughtException', function (err) {
            console.log('Caught exception: ' + err);
            console.log(err.stack);
            _.each(config.clientOptions.channels, function(channel) {
                client.say(channel, "WARNING: The bot has generated an unhandled error. Quirks may ensue.")
            });
        });
    }

};

/**
 * Add a public command to the bot
 * @param cmd Command keyword
 * @param mode User mode that is allowed
 * @param cb Callback function
 */
exports.cmd = function (cmd, mode, cb) {
    commands.push({
        cmd: cmd,
        mode: mode,
        callback: cb
    });
};

/**
 * Add a msg command to the bot
 * @param cmd Command keyword
 * @param mode User mode that is allowed
 * @param cb Callback function
 */
exports.msg = function (cmd, mode, cb) {
    msgs.push({
        cmd: cmd,
        mode: mode,
        callback: cb
    });
};

/**
 * Add an irc event listener to the bot
 * @param event Client event
 * @param cb Callback function
 */
exports.listen = function (event, cb) {
    client.addListener(event, function() {
        cb(client, arguments);
    });
};

exports.config = config;
exports.commands = commands;
exports.msgs = msgs;

exports.cah = new Games();

