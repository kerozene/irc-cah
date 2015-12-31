var    _ = require('lodash'),
    Game = require('./controllers/game');

module.exports = function(repl, bot) {
    var cmd = {};

    repl.context = _.extend(repl.context, {
        repl: repl,
        bot:  bot,
        conf: bot.config,
        irc:  bot.client,
        chan: bot.channel,
        g:    bot.game,
        c:    bot.controller.cmd
    });

    repl.defineCommand('start', {
        help: "Start a game. [rounds] [deck, ...]",
        action: function(cmdArgs) {
            var rounds = bot.config.pointLimit;
            cmdArgs = cmdArgs.split(' ');
            if (cmdArgs[0] && !isNaN(cmdArgs[0])) {
                rounds = parseInt(cmdArgs[0]);
                cmdArgs = _.rest(cmdArgs);
            }
            bot.game = new Game(bot, rounds, cmdArgs);
        }
    });

    cmd.say = function(message) {
        var target;
        if (message[0] === '@') {
            message = message.split(' ');
            target = message.shift();
            message = message.join(' ');
        }
        target = target || bot.channel;
        bot.client.say(target, message);
    };
    repl.defineCommand('say', {
        help: "Say message to channel or @nick",
        action: cmd.say
    });
    repl.defineCommand('s', {
        action: cmd.say
    });

    repl.defineCommand('act', {
        help: "Perform action in channel",
        action: function(message) {
            bot.client.action(bot.channel, message);
        }
    });

    repl.defineCommand('stop', {
        help: "Stop the game",
        action: function() { bot.game.stop(); }
    });

    repl.defineCommand('pause', {
        help: "Pause the game",
        action: function() { bot.game.pause(); }
    });

    repl.defineCommand('resume', {
        help: "Resume the game",
        action: function() { bot.game.resume(); }
    });

    cmd.kick = function(nick) {
        var cmd = bot.controller.cmd;
        var say = cmd.say;
        cmd.say = console.log;
        cmd.remove(null, [ nick ]);
        cmd.say = say;
    };
    repl.defineCommand('kick', {
        help: "Remove <nick>",
        action: cmd.kick
    });
    repl.defineCommand('k', {
        action: cmd.kick
    });

    repl.defineCommand('nicks', {
        help: "Get a list of nicknames in the channel",
        action: function() {
            nicks = _.without(bot.client.nicksInChannel(bot.channel), bot.client.nick, 'ChanServ');
            console.log(nicks.join(' '));
        }
    });

/*
    repl.defineCommand('', {
        help: "",
        action: function() {
        }
    });
*/

};
