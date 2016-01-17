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
