/**
 * Cards Against Humanity IRC bot
 * main application script
 * @author Teemu Lahti <teemu.lahti@gmail.com>
 * @version 0.6.0
 */

var repl = require('n_');

console.log('Cards Against Humanity IRC bot');

var Bot = require('./app/bot'),
    bot = new Bot();

require('./app/repl')(repl, bot);

bot.connect();
