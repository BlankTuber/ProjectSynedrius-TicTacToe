// game/Game.js
const SYMBOLS = {
    PLAYER_ONE: 'X',
    PLAYER_TWO: 'O'
};

const WIN_CONDITIONS = [
    ['0-0', '0-1', '0-2'], // Rows
    ['1-0', '1-1', '1-2'],
    ['2-0', '2-1', '2-2'],
    ['0-0', '1-0', '2-0'], // Columns
    ['0-1', '1-1', '2-1'],
    ['0-2', '1-2', '2-2'],
    ['0-0', '1-1', '2-2'], // Diagonals
    ['0-2', '1-1', '2-0']
];

class Game {
    constructor() {
        this.players = [];
        this.spectators = [];
        this.plays = {};
        this.currentPlayer = SYMBOLS.PLAYER_ONE;
        this.isGameOver = false;
        this.winner = null;
    }

    // Game methods (addPlayer, addSpectator, makeMove, etc.)
    // Paste the methods you defined in `app.js` here

    reset() {
        this.plays = {};
        this.currentPlayer = SYMBOLS.PLAYER_ONE;
        this.isGameOver = false;
        this.winner = null;
    }
}

module.exports = { Game, SYMBOLS, WIN_CONDITIONS };