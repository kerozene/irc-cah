var util = require('util');

var fixtures = {
	nick: 'testBot',
	channel: '#test',
	client: {
		nick: 'testBot',
		say:    function() {},
		notice: function() {},
		send:   function() {},
		nicksInChannel: function() { return ['bob', 'jim', 'testBot', 'sarah']; },
		addListener: function() {},
		removeListener: function() {},
		setChanMode: function() {}
	},
	config: {
		commandPrefixChars: ".!"
	},
    log: function(message, level) {
        // TODO implement levels
        util.log(message);
    },
    warn: function(message, level) {
        // TODO implement levels
        console.error(message);
    }
};

module.exports = fixtures;
