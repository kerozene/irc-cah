/**
 * Cards Against Humanity IRC bot
 * main application script
 * @author Teemu Lahti <teemu.lahti@gmail.com>
 * @version 0.6.0
 */
console.log('Cards Against Humanity IRC bot');

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

var Bot = require('./app/bot'),
    bot = new Bot();


bot.connect();
