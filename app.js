/**
 * Cards Against Humanity IRC bot
 * main application script
 * @author Teemu Lahti <teemu.lahti@gmail.com>
 * @version 0.6.0
 */

var repl = require('repl').start('> ');

console.log('Cards Against Humanity IRC bot');

var Bot = require('./app/bot'),
    bot = new Bot();

repl.context.repl = repl;
repl.context.bot  = bot;
repl.context.conf = bot.config;
repl.context.irc  = bot.client;
repl.context.c    = bot.controller.cmd;
repl.context.chan = bot.channel;
repl.context.g    = bot.game;

bot.connect();
