
// Get all the matches for a RegExp capturing group
exports.getMatches = function (string, regex, index) {
    index = index || 1; // default to the first capturing group
    var match, matches = [];
    while ((match = regex.exec(string))) {
        matches.push(match[index]);
    }
    return matches;
};
