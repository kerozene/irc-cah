/**
 * Cards Against Humanity IRC bot
 * main application script
 * @author Teemu Lahti <teemu.lahti@gmail.com>
 * @version 0.6.0
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

var repl = (process.env.NODE_ENV === 'development') ? require('repl').start('> ') : { context: {} };

console.log('Cards Against Humanity IRC bot');


var Bot = require('./app/bot'),
    bot = new Bot();

repl.context.repl = repl;
repl.context.bot  = bot;
repl.context.config = bot.config;
repl.context.client = bot.client;
repl.context.cah    = bot.cah;

bot.connect();
