var    _ = require('lodash'),
    util = require('util');

/**
 * Get all the matches for a RegExp capturing group
 * @param  {string} string
 * @param  {RegExp} regex
 * @param  {number} index
 * @return {string[]}
 */
exports.getMatches = function getMatches(string, regex, index) {
    index = index || 1; // default to the first capturing group
    var match, matches = [];
    while ((match = regex.exec(string))) {
        matches.push(match[index]);
    }
    return matches;
};

/**
 * Get a string with special regex chars escaped
 * @param  {string} str
 * @return {string}
 */
exports.RegExpEscape = function RegExpEscape(str) {
    return str.replace(/[-\\^$*+?.()|[\]{}]/g, '\\$&');
};

/**
 * Get a string with special regex chars escaped except '*' and '?'
 * @param  {string} str
 * @return {string}
 */
exports.RegExpIrcEscape = function RegExpIrcEscape(str) {
    str = str.replace(/[-\\^$+.()|[\]{}]/g, '\\$&');
    str = str.replace(/[*?]/g, '.$&');
    return str;
};

/**
 * Test whether a string matches an irc-style mask
 * @param  {string} str
 * @param  {string} mask
 * @return {boolean}
 */
exports.maskMatch = function maskMatch(str, mask) {
	mask = this.RegExpIrcEscape(mask);
	var re = new RegExp(mask);
	return re.test(str);
};

/**
 * Convert an array of strings to uppercase
 * @param  {string[]} arr
 * @return {string[]}
 */
exports.arrayToUpperCase = function arrayToUpperCase(arr) {
    return _.map(arr, function(str) { return str.toUpperCase(); });
};

/**
 * Get user@host string from a user object
 * @param  {Object} user - bot.users or client.users or game.players
 * @return {string}
 */
exports.getUhost = function getUhost(user, char) {
	char = char || '@';
	if (!user)
		return char;
	var host = user.host || user.hostname;
	var username = user.username || user.user;
    return [ username, host ].join(char);
};

/**
 * Get an identifier key from a user object - account name (preferably) or user@host
 * @param  {Object} user
 * @return {string}
 */
exports.getUserKey = function getUserKey(ircUser) {
    return (ircUser.isRegistered) ? ircUser.account : this.getUhost(ircUser);
};

/**
 * Get all objects that are tied for _.max()
 * @param  {object[]} list  - array of objects to compare
 * @param  {string}   field - property to compare on
 * @return {object[]}       - array of objects with max
 */
exports.multipleMax = function multipleMax(list, field){
    var max = _.maxBy(list, function(item){
        return item[field];
    });

    return _.filter(list, function(item){
        return item[field] === max[field];
    });
};

/**
 * Create a string from list written in natural english
 * @param  {string[]} list - array of strings to join
 * @return {string}
 */
exports.arrayToSentence = function(list) {
    var last = list.pop();
    return (list.length) ? util.format('%s and %s', list.join(', '), last) : last;
};
