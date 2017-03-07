# Cards Against Humanity IRC bot

This is a [node.js](https://nodejs.org) bot that lets you play [Cards Against Humanity](http://www.cardsagainsthumanity.com/) over IRC. This version is running on [##humanity @ freenode](https://kiwiirc.com/client/chat.freenode.net/##humanity). It is heavily based on a bot from #cah on IRCnet.

## Install

1. Clone the repository.
2. Copy the configuration file `config.json.example` to `config.json`
2. Edit configuration file with your channel & server settings.
3. Install dependencies using `npm install`.

##### Requirements
* Node.js - tested on 4+

## Run
Run the bot by running `npm start`, in tmux or screen for example.

## SASL and SSL
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

## Game Commands
The prefix character '.' is configurable. Settings for specific commands are configurable in `commands.json`

||Formatting|
|---|---|
|`[]`| optional command parameter
|`<>`| required command parameter
|`[ ...]`| parameter can be repeated
|`#`| a number

### General Commands

|Command|Parameters|Description|
|---|---|---|
| `.help` || List commands.
| `.test` || Get a test NOTICE from the bot - if you can't see this, you won't be able to see your cards.
| `.join` `(.j)` | `*` | Join the currently running game or else start a new one, taking the same parameters as `.start`.
| `.start` | `[#] [~deckGroup ...] [+deck ...] [-deck ...]` | Start a new game with default or specified card decks. **(See [Starting a Game](#starting-a-game))**
| `.cstart` | `^` | Start a new game in Card Czar mode (standard game).
| `.vstart` | `^` | Start a new game without a card czar -- all players vote for the winner each round.
| `.decks` `(.d)` || Show the list of available card decks and the deck group tags that are defined. If used during a game it will list the decks active for that game. **(See [Decks and Groups](#decks-and-groups))**
| `.deckinfo` `(.di)` | `<code>` | Display information about the deck `code` -- e.g. `.di CAHBS` **(See [Decks and Groups](#decks-and-groups))**
| `.groupinfo` `(.gi)` | `<tag>` | List the decks and groups collected under `tag` -- e.g. `.gi ~DEFAULT` **(See [Decks and Groups](#decks-and-groups))**
| `.ping` || Tell the bot to highlight all the available players in the channel.
| `.away` | `["forever"]` | Make yourself exempt from being `.ping`ed
| `.beer` | `[nick...]|"all"` | Order a beer for yourself, someone else or all current players.
| `.points` || Show players' *awesome points* in the current game.
| `.list` || List players in the current game.
| `.status` || Show current status of the game. Output depends on the state of the game (e.g. when waiting for players to play, you can check who hasn't played yet).

### Player Commands

|Command|Parameters|Description|
|---|---|---|
| `.quit` `(.q)` || Leave the game.
| `.cards` `(.c)` || Show the cards you have in your hand.
| `#` | `[#...]` | Pick number `#` -- typing just a number or numbers is exactly the same as using the `.pick` command.
| `.pick (.p)` | `# [#...]` | Alias for `.play` and `.winner` commands (or `.vote` in no-czar games).
| `.play` | `# [#...]` | Play a card from your hand, `#` being the number of the card in the list. Play as many numbers separated by spaces as the current card required.
| `.winner` `(.w)` | `#` | Pick a winner of the round, `#` being the number of the entry in the list. Only for the current *card czar*.
| `.vote`

### Op Commands

You must be opped in the channel to use these commands (configurable).

|Command|Parameters|Description|
|---|---|---|
| `.stop` || Stop the currently running game.
| `.pause` || Pause the currently running game.
| `.resume` || Resume a paused game.
| `.remove` `(.r)` | `<nick>` | Remove a player from the game.

The bot will also act on invites to channels it knows about.

### Starting a Game

The `.start` command provides several options, most importantly allowing you to choose the card decks for your game. You can list the available decks using the `.decks` command at any time while a game is *not* running.

`.start #` -- where `#` is the number of points needed to win.
```
  .start 5
```

`.start # code` -- load specific card decks by code
```
  .start 3 CAHBS
  .start 5 CAHBS JBYMF FFE2X
```

`.start # ~group` -- whole deck groups can be referenced by tag. Tags start with a ~ (tilde)
```
  .start 7 ~FULL
  .start 6 ~STANDARD ~REGIONAL
```

`.start # ... -code` -- start without a specific deck or decks
```
  .start 5 ~STANDARD -CAHBS
  .start 8 ~DEFAULT JBYMF -FFE2X
```

You can also start a game in Voting or 'Democracy' mode -- there is no Card Czar and the winner in each round is chosen by vote. In this mode, players must send their vote by private message, e.g. `/msg cabbit 4`

### Decks and Groups

All cards are sourced from [Cardcast](https://www.cardcastgame.com) (where you can easily build your own decks). Decks are made available by enabling them in `config.json`. You can also define arbitrary deck group tags. The default decks to be loaded are set by defining the `~DEFAULT` tag.

## Notices in Active Window

Some important game messages are sent by NOTICE.
To get notices in the active window of your client:
* [WeeChat](https://weechat.org) -- (assuming server 'freenode'): `/set irc.msgbuffer.freenode.notice current`
* [Irssi](http://www.irssi.org) -- use [active_notice.pl](http://scripts.irssi.org/scripts/active_notice.pl)
* [mIRC](http://www.mirc.com) -- Go to Options -> IRC and set ['Show in active'](http://i.imgur.com/5UENoA2.png)

## Contribute
All contributions are welcome in any form, be it pull requests for new features and bug fixes or issue reports or anything else. Feel free to drop into [##humanity-dev @ freenode](https://kiwiirc.com/client/chat.freenode.net/##humanity-dev)

It is recommended to use the **develop** branch as a starting point for new features.

## Thanks
Thanks to @teeli for the original bot and to everyone who has contributed feedback and suggestions.

## License
Cards Against Humanity IRC bot and its source code is licensed under a [Creative Commons BY-NC-SA 2.0 license](http://creativecommons.org/licenses/by-nc-sa/2.0/).
