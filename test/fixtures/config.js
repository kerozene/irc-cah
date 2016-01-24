var fixtures = {
	config: {
	    startOnFirstJoin: true,
	    maxIdleRounds: 1,
	    timeLimit: 120,
	    timeBetweenRounds: 10,
	    timeWaitForPlayers: 180,
	    waitFromLastJoin: true,
	    commandThrottle: [3, 10],
	    voicePlayers: true,
	    pointLimit: 1,
		commands: [
			{
				commands: ["start", "go"],
				info:     "Start a game with # points to win and selected decks (see %%decks).",
				handler:  "start",
				params:   [
					{
						"name":     "points",
						"type":     "number",
						"required": false,
						"multiple": false
					},
					{
						"name":     "~deckGroup",
						"type":     "string",
						"required": false,
						"multiple": true
					},
					{
						"name":     "+deck",
						"type":     "string",
						"required": false,
						"multiple": true
					},
					{
						"name":     "-deck",
						"type":     "string",
						"required": false,
						"multiple": true
					}
				]
			},
			{
				commands: ["stop"],
				info:     "Stop the current game",
				flag:     "o",
				handler:  "stop"
			},
			{
				commands: ["join", "j"],
				info:     "Join the current game or start a new one",
				handler:  "join"
			}
		]
	}
};

module.exports = fixtures;