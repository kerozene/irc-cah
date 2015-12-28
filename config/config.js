var shush = require('shush'),
        _ = require('underscore'),
     util = require('util');

var config = _.extend(
    require(__dirname + '/../config/env/all.js'),
      shush(__dirname + '/../config/env/' + process.env.NODE_ENV + '.json') || {}
);
config.commands = shush(__dirname + '/../config/commands.json');

var Decks = require(config.root + '/app/controllers/decks');
config.decksTool = new Decks();

config.loadDecks = [];
config.decksTool.init().then(function(message) {
	util.log(message);
	_.each(config.decks, function(deck) {
		config.decksTool.fetchDeck(deck).then(function(data) {
			config.loadDecks.push(data);
			var pad = function(str, char, width) {
				var padded = new Array(width + 1).join(char) + str;
				return padded.slice(-width);
			};
			util.log(util.format.apply(null, [ 'Enabled deck %s: %s questions %s answers', data.code ].concat(
				_.map([ data.calls.length, data.responses.length ], function(el) { return pad(el, ' ', 4); })
			)));
		}, function(error) {
			if (error.name === 'NotFoundError')
				error.message = error.message.split('/').reverse()[0];
			util.log(error.name + ': ' + error.message);
		});
	});
});


module.exports = config;
