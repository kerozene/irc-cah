
module.exports = function(app) {
    var games = app.cah;
    app.cmd('start', '', games.start);
    app.cmd('stop', 'o', games.stop);
    app.cmd('join', '', games.join);
    app.cmd('j', '', games.join);
    app.cmd('quit', '', games.quit);
    app.cmd('q', '', games.quit);
    app.cmd('remove', 'o', games.remove);
    app.cmd('r', 'o', games.remove);
    app.cmd('cards', '', games.cards);
    app.cmd('c', '', games.cards);
    app.cmd('play', '', games.play);
    app.cmd('list', '', games.list);
    app.cmd('winner', '', games.winner);
    app.cmd('w', '', games.winner);
    app.cmd('points', '', games.points);
    app.cmd('status', '', games.status);
    app.cmd('pause', 'o', games.pause);
    app.cmd('resume', 'o', games.resume);
    app.cmd('pick', '', games.pick);
    app.cmd('p', '', games.pick);
    app.cmd('help', '', games.help);
    app.cmd('test', '', games.test);
    app.cmd('beer', '', games.beer);
    app.listen('names', games.beerHandler);
};
