var _ = require('lodash');

/**
 * Get all the matches for a RegExp capturing group
 * @param  {string} string
 * @param  {RegExp} regex
 * @param  {number} index
 * @return {string[]}
 */
exports.getMatches = function (string, regex, index) {
    index = index || 1; // default to the first capturing group
    var match, matches = [];
    while ((match = regex.exec(string))) {
        matches.push(match[index]);
    }
    return matches;
};

/**
 * Convert an array of strings to uppercase
 * @param  {string[]} arr
 * @return {string[]}
 */
exports.arrayToUpperCase = function(arr) {
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
