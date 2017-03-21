var           _ = require('lodash'),
             fs = require('fs'),
           util = require('util'),
        Promise = require('bluebird'),
        storage = require('node-persist'),
    CardcastAPI = require('cardcast-api').CardcastAPI,
      utilities = require('../../app/utilities');

Promise.config({warnings: false});

/**
 * @param {Bot} bot
 */
var Decks = function(bot) {
    var self   = this,
        config = bot.config;
    self.storage = storage.create({
        dir: fs.realpathSync('.') + '/cards',
        ttl: 7 * 24 * 60 * 60 * 1000
    });
    self._findCardState = {};

    /**
     * Check inputted code and get a proper deckCode
     *   - always use this in a try-catch
     * @param  {string} deckCode
     * @return {string}
     */
    self.getValidDeckCode = function(deckCode) {
        if (!deckCode)
            throw 'You must specify a deck code.';

        if (!deckCode.match(/^\w{5}$/))
            throw util.format('Invalid deck code format: %s', deckCode);

        deckCode = deckCode.toUpperCase();

        if (!_.includes(config.decks, deckCode))
            throw util.format('Deck %s is not enabled. If you really want it, yell about it.', deckCode);

        return deckCode;
    };

    /**
     * @return {Promise}
     */
    self.init = function() {
        return new Promise(function(resolve, reject) {

            self.storage.init().then(function() {

                setTimeout(function() { // promise is fulfilled even though data isn't loaded yet
                    self.api = new CardcastAPI({timeout: config.apiTimeout});
                    resolve(util.format('Card storage: %s keys found', self.storage.length()));
                }, 1000);

            }).catch(function(error) {
                reject(error);
            });
        });
    };

    /**
     * @param  {string}  deckCode
     * @return {Promise}
     */
    self.fetchDeck = function(deckCode) {
        var deckData, key = 'deck-' + deckCode;

        return self.storage.getItem(key)
        .then(function(deckData) {
            if (deckData)
                return deckData;

            bot.log(util.format("Fetching deck '%s' from Cardcast API", deckCode));

            return self.api.deck(deckCode)
            .then(function(deck) { return deck.populatedPromise; })
            .then(function(populated) {
                var fields = ['name', 'code', 'description', 'category', 'created', 'updated',
                              'rating', 'author', 'baseURL', 'calls', 'responses'];
                deckData = _.pick(populated, fields);
                return self.storage.setItem(key, deckData)
                .then(function() {
                    bot.log(util.format("Stored deck: %s", deckCode));
                    return deckData;
                });
            });
        });
    };

    /**
     * @param  {string[]} [decksList] - list of deck codes
     * @return {Promise}
     */
    self.loadDecks = function(decksList) {
        decksList = decksList || config.decks;

        return Promise.map(decksList, function(deck) {

            self.fetchDeck(deck)
            .then(function(data) {

                bot.decks.push(data);
                var message = [ 'Enabled deck: %s (%s black %s white) -- "%s" by %s', data.code ]
                .concat(
                    _.map([ data.calls.length, data.responses.length ], function(el) {
                        return _.padStart(el, 4, ' ');
                    })
                )
                .concat([ data.name, data.author ]);
                bot.log(util.format.apply(null, message));

            }, {concurrency: 2})
            .catch(function(error) {
                if (error.name === 'NotFoundError')
                    error.message = error.message.split('/').reverse()[0];
                bot.log(util.format('%s: %s', error.name, error.message));
                bot.log(error.stack);
            });
        });
    };

    /**
     * @param  {string}  deckCode
     * @return {Promise}
     */
    self.reloadDeck = function(deckCode) {
        deckCode = deckCode.toUpperCase();
        var key = 'deck-' + deckCode;

        return Promise.try(function() {
            if (!_.includes(self.storage.keys(), key))
                throw new Error(util.format('Deck code not found in storage: %s', deckCode));

            if (!self.storage.removeItemSync(key))
                throw new Error(util.format('Could not delete key for %s', deckCode));

            return self.loadDecks([ deckCode ]);
        });
    };

    self._getSearchPredicate = function(search, searchType, noCase) {
        var predicate;
        var searchFor = search;
        var flags = (noCase) ? 'i' : '';

        if (searchType === 'id')
            return {id: searchFor};

        else if (searchType === 'text')
            searchFor = new RegExp(searchFor, flags);
        else if (searchType !== 'regex')
            throw new Error(util.format('Invalid searchType %s', searchType));

        return function(card) {
            var fullText = card.text;
            if (typeof fullText != 'string')
                fullText = fullText.join('_');

            return searchFor.test(fullText);
        };
    };

    self._searchCollection = function(cardType) {
        var collection = self._findCardState.deck[cardType];
        var predicate = self._getSearchPredicate(
            self._findCardState.search,
            self._findCardState.searchType,
            self._findCardState.noCase
        );

        var card = _.find(collection, predicate);

        if (!card)
            return false;

        self._findCardState.response = {
            card: card,
            deck: self._findCardState.deckCode,
            cardType: cardType
        };
        return true;
    };

    self._searchDeck = function(deck) {
        self._findCardState.deck = deck;
        return _.some(self._findCardState.checkCardTypes, _.bind(self._searchCollection, self));
    };

    /**
     * @param  {string[]} codes - list of deck codes
     * @return {string[]} - list of valid deck codes
     */
    self._filterDeckCodes = function(codes) {
        return _.intersection(utilities.arrayToUpperCase(codes), config.decks);
    };

    self._getValidCardTypes = function(cardType) {
        var validCardTypes = ['calls', 'responses'];

        if (!cardType)
            return validCardTypes;

        if (!_.includes(validCardTypes, cardType))
            throw new Error(util.format('Invalid cardType %s', cardType));

        return [ cardType ];
    };

    self._getValidDeckCodes = function(deckCodes) {
        if (!deckCodes)
            return config.decks;

        if (typeof deckCodes == 'string')
            deckCodes = deckCodes.split(' ');

        deckCodes = utilities.arrayToUpperCase(deckCodes);

        var initDeckCodes = deckCodes;
        deckCodes = self._filterDeckCodes(deckCodes);

        if (!_.isEqual(deckCodes, initDeckCodes)) {
            var missingDecks = _.difference(initDeckCodes, deckCodes);
            throw new Error(util.format(
                'Deck%s not enabled for searching: %s',
                missingDecks.length > 1 ? 's' : '',
                missingDecks
            ));
        }

        return deckCodes;
    };

    /**
     * @typedef Card
     * @property {string}          id
     * @property {Date}            created
     * @property {string|string[]} text
     * @property {string|string[]} displayText
     */

    /**
     * @typedef Response
     * @property {Card}
     * @property {string} deck     - the deckCode where the card was found
     * @property {string} cardType - 'calls' or 'responses'
     */

    /**
     * @param  {string|RegExp} search
     * @param  {string}        searchType         - 'id', 'text' or 'regex'
     * @param  {Object}        [options]
     * @param  {string}        [options.cardType] - 'calls' or 'responses'
     * @param  {boolean}       [options.caseInsensitive]
     * @param  {string}        [options.deckCodes]
     * @return {Promise<Response>}
     */
    self.findCard = function(search, searchType, options) {
        options = options || {};
        self._findCardState = {
            response:       {},
            search:         search,
            searchType:     searchType,
            noCase:         (options.caseInsensitive !== false),
            checkCardTypes: self._getValidCardTypes(options.cardType)
        };
        var deckCodes;
        try { deckCodes = self._getValidDeckCodes(options.deckCodes); }
        catch(e) { self._findCardState.response.err = e.message; }

        var decks = _.map(deckCodes, function(deckCode) {
            self._findCardState.deckCode = deckCode;
            return self.fetchDeck(deckCode);
        });

        return Promise.all(decks)
                .then(_)
                .call('some', self._searchDeck, self)
                .then(function()  { return self._findCardState.response; })
                .catch(function() { return {}; });
    };

    /**
     * Get a list of the decks specified under a group tag
     * @param  {string}  group   - group tag
     * @param  {boolean} recurse - whether to recursively resolve group tags
     * @return {string[]}
     */
    self.getDecksFromGroup = function(group, recurse) {
        recurse = recurse !== false;
        var decks = [];
        var groupData = config.deckGroups[group];
        if (!groupData)
            return decks;
        _.each(groupData, function(data) {
            if (recurse && data[0] === '~')
                data = self.getDecksFromGroup(data); // recurse on a reference to a group
            decks = decks.concat(data);
        });
        return decks;
    };

};

module.exports = Decks;
