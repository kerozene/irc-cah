
var repl = require('n_');

console.log('Cards Against Humanity IRC bot');

var Bot = require('./app/bot'),
    bot = new Bot();

require('./app/repl')(repl, bot);

bot.init()
.then(bot.connect);
