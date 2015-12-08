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
* **# [#...] - Pick number # (card or winning entry)",
* **!beer [nick ...]|all** - Order a beer for yourself, someone else or all current players.

The bot will also act on invites to channels it knows about.

Some of these commands reply as NOTICE.
To get notices in the active window:
* [WeeChat](https://weechat.org/) - (assuming server 'freenode'): `/set irc.msgbuffer.freenode.notice current`
* [Irssi](http://www.irssi.org) - use [active_notice.pl](http://scripts.irssi.org/scripts/active_notice.pl)

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
Main configuration files are located in `config/env`. There are two files by default for two different environments - development and production (e.g. if you want to test the bot on a separate channel).

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
