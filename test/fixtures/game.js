
var fixtures = {
	STATES: {
	    STOPPED:   'Stopped',
	    PLAYABLE:  'Playable',
	    PLAYED:    'Played',
	    ROUND_END: 'RoundEnd',
	    WAITING:   'Waiting',
	    PAUSED:    'Paused'
	},
	players: [
		{
            id: "card1",
            nick: "Frederick",
            user: "~freddy",
            hostname: "unaffiliated/fredd",
            cards: {
            	reset: function() {},
            	numCards: function() { return 5; }
            },
            hasPlayed: true,
            isCzar: false,
            points: 3,
            inactiveRounds: 0
        },
		{
            id: "card2",
            nick: "Napoleon",
            user: "~napln",
            hostname: "unaffiliated/napoleon",
            cards: {
            	reset: function() {},
            	numCards: function() { return 5; }
            },
            hasPlayed: false,
            isCzar: true,
            points: 2,
            inactiveRounds: 0
        },
		{
            id: "card3",
            nick: "Vladimir",
            user: "~vlad",
            hostname: "unaffiliated/vladdy",
            cards: {
            	reset: function() {},
            	numCards: function() { return 5; }
            },
            hasPlayed: false,
            isCzar: false,
            points: 1,
            inactiveRounds: 1
        },
		{
            id: "card4",
            nick: "Julius",
            user: "~juls",
            hostname: "unaffiliated/jules",
            cards: {
            	reset: function() {},
            	numCards: function() { return 0; }
            },
            hasPlayed: false,
            isCzar: false,
            points: 1,
            inactiveRounds: 0
        }
	]
};

module.exports = fixtures;