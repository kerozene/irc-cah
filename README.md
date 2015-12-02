#Cards Against Humanity IRC bot

IRC bot that let's you play [Cards Against Humanity](http://www.cardsagainsthumanity.com/) in IRC. The game is running in IRCnet on #cah, but you can just as easily run your own instance on your own channel for more private games.

##Commands
(as **!command** or **.command**)
Commands marked (ops) require +o by default - edit config/commands.js to change this.
* **!start #** - Start a new game. Optional parameter can by used to set a point limit for the game (e.g. `!start 10` to play until one player has 10 points.)
* **!help** - Show game instructions.
* **!stop** - Stop the currently running game. (ops)
* **!pause** - Pause the currently running game. (ops)
* **!resume** - Resume a paused game. (ops)
* **!join !j** - Join to the currently running game.
* **!quit !q** - Quit from the game.
* **!remove !r <nick>** - Remove a player from the game. (ops)
* **!cards !c** - Show the cards you have in your hand.
* **!play # [#...]** - Play a card from your hand, # being the number of the card in the list. Play as many numbers separated by spaces as the current card required.
* **!winner !w #** - Pick a winner of the round, # being the number of the entry in the list. Only for the current *card czar*.
* **!points** - Show players' *awesome points* in the current game.
* **!list** - List players in the current game.
* **!status** - Show current status of the game. Output depends on the state of the game (e.g. when waiting for players to play, you can check who hasn't played yet)
* **!pick !p # [#...]** - Alias for !play and !winner commands.
* **!beer [nick]** - Order a beer for yourself or someone else.

Some of these commands reply as notice. If you use [Irssi](http://www.irssi.org), you can use [active_notice.pl](http://scripts.irssi.org/scripts/active_notice.pl) to get notices on the active window instead of status window.

##Install
1. Clone the repository.
2. Copy the configuration file production.json.example to production.json
2. Edit configuration file with your channel & server settings.
3. Install dependencies using `npm install`.

###Requirements
* Node.js 0.10.*

##Run
Run the bot by running `node app.js`, or if you want to run it with development settings instead of production, run `NODE_ENV=development node app.js`.

##Configuration
Main configuration files are located in `config/env`. There are two files by default for two different environments, development and production (e.g. if you want to test the bot on a separate channel).

###Configuration Settings
**Note:** if you're copy/pasting - comments are not allowed in JSON files.
```JavaScript
{
    "server": "irc.saunalahti.fi",  // - Server to connect to.
    "nick": "cah-dev",              // - The bot's nickname.

    "notifyUsers": true,

    // ^ Send a notice to everyone in the channel when a game is starting?
    //   Users with ~ and & modes are not notified.

    "startOnFirstJoin": true,       // - When no game is running, treat the first !join as !start?

    "maxIdleRounds": 2,             // - Number of inactive game rounds causing a player to be removed.

    "timeLimit": 120,               // - Seconds to allow for playing cards or picking winners.

    "timeBetweenRounds": 10,        // - Seconds to pause after a round finishes.
    
    "voicePlayers": false,          // - Give current players +v on join? (Bot will assume it is opped.)
    
    "pointLimit": 10,

    // ^ Default number of points needed to win the game. (!start # to override.)
    //   0 or a negative number means the game continues until `!stop` command is issued.
    
    "exitOnError": false,

    // ^ Allow the bot process to crash when there is an uncaught exception?
    //   Otherwise, notify channel and log the stack trace.

    "stopOnLastPlayerLeave": false,   // - Stop the game if there are no more players (playing or waiting).

    "commandPrefixChars": ".!",

    // ^ List of characters a command can start with, e.g. !join, .join
    //   The first character is considered the default char and is used in help text.

    "topic": {

    // The bot can add/update a segment of the channel topic when games start and end.

        "position": "right",        // - Where to place the new segment relative to the main topic.

        "separator": "::",          // - String separating the topic segments.

        "messages": {               // - Set any of these to an empty string to disable.

            "on":  ["A game is running. Type !join to get in on it!", "bold.yellow"],

            // ^ Set when a game starts.
            //   A message can be a list containing a string, and an optional formatting instruction.
```

For formatting options, see the [IRC-Colors](https://www.npmjs.com/package/irc-colors) module.

```JavaScript
            "off": "",

            // ^ Set when a game ends. If 'winner' is set, this should probably be empty.

            "winner": "Reigning champion: <%= nick %>"

            // ^ When the game ends, glorify the winner.
            //   A message can be just a string.
            //  'nick' is a valid template tag inside the "winner" message.
        }
    }

    "connectCommands": [

    // ^ Sent after connecting to server: for example, to identify with nickserv, as below.

        {
            "target": "nickserv",
            "message": "identify cah-dev mypassword"
        }
    ],

    "joinCommands": {
        "#pi-cah-dev": [

        // ^ Sent after joining this channel.

            {
                "target": "#pi-cah-dev",
                "message": "Hello guys"
            },
    		{
    			"target": "yournick",
    			"message": "I just joined #pi-cah-dev."
    		}
        ]
    },

    "userJoinCommands": {
        "#pi-cah-dev": [

        // ^ Sent after someone else joins this channel.
        //   'nick' and 'channel' are valid template tags in userJoinCommands messages.

            {
                "target": "#pi-cah-dev",
                "message": "Hi <%= nick %>! Type !join to play"
            }
        ]
    },
```

For the `clientOptions` directive, refer to the [Node-IRC documentation](https://node-irc.readthedocs.org/en/latest/API.html#client).

```JavaScript
    "clientOptions": {

    // General IRC-related settings.

        "userName": "cah",
        "debug": true,
        "channels": ["#pi-cah-dev"],
        "messageSplit": 410,             // Split player card output into multiple notices if message is longer than this
        "floodProtection": true,
        "floodProtectionDelay": 2000
    },

    // When the !beer command is issued, a random beer is selected from this list.
    "beers": [ "Blue Moon", "Pabst Blue Ribbon", "Yuengling", "Stella Artois", 
               "Modelo", "Fat Tire Amber Ale", "Magic Hat", "Samuel Adams",
               "Sierra Nevada", "Leffe Blonde", "Duvel", "Warsteiner", "Erdinger Weiss"
    ]

}
```

###SASL and SSL
If you would rather identify to the server directly instead of msging nickserv, you can use SASL:

```JavaScript
    "clientOptions": {
        ...
        "sasl": true,               // - Enable SASL?
        "secure": true,             // - Enable SSL encryption?
        "selfSigned": true,         // - If SSL, allow unverified server certificates?
        "port": 6697,               // - The SSL port your server listens on.
        "userName": "cah",          // - The account name to identify as.
        "password": "mypassword"    // - The account password.
    }
```

###Cards
Card configuration is located in `config/cards` directory. Some files are included by default, that contain the default cards of the game plus some extra cards from [BoardGameGeek](http://boardgamegeek.com/). You can add your custom cards to `Custom_a.json` (for answers) and `Custom_q.json` (for questions), using the same format as the default card files. Any card you add to these files will also be automatically loaded to the game during start up..

##TODO
* Save game & player data to MongoDB for all time top scores & other statistics.
* Config options for rule variations, such as voting the best instead of card czar choosing the winner.
* The haiku round.
* Allow players to change one card per round (make it an option in config?)

##Contribute
All contributions are welcome in any form, be it pull requests for new features and bug fixes or issue reports or anything else.

It is recommended to use the **develop** branch as a starting point for new features.

##Thanks
Special thanks to everyone on the ***super awesome secret IRC channel*** that have helped me test this and given feedback during development.

##License
Cards Against Humanity IRC bot and its source code is licensed under a [Creative Commons BY-NC-SA 2.0 license](http://creativecommons.org/licenses/by-nc-sa/2.0/).
