// Import required modules
const express = require('express');
const session = require('express-session');
const { createServer } = require('http');
const { join } = require('path');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server);
const port = 5000;

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const sessionMiddleware = session({
    secret: 'azertyuil;,nbfdswxcv_bnhgf',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
});
app.use(sessionMiddleware);

// In-memory users storage
let users = {};

app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (users[username]) {
        res.redirect('/register?error=Username already exists');
    } else if (username === '' || password === '') {
        res.redirect('/register?error=Username and password are required');
    } else {
        users[username] = password;
        res.redirect('/login?information=Registered successfully');
    }
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (users[username] && users[username] === password) {
        req.session.user = username;
        req.session.save(err => {
            if (err) {
                console.log(err);
            } else {
                res.redirect('/');
            }
        });
    } else if (!users[username]) {
        res.redirect('/login?error=Invalid username');
    } else {
        res.redirect('/login?error=Invalid password');
    }
});

app.get('/', (req, res) => {
    if (!req.session.user || !users[req.session.user]) {
        res.redirect('/login');
    } else {
        res.sendFile(join(__dirname, 'index.html'));
    }
});

app.get('/login', (req, res) => {
    res.sendFile(join(__dirname, 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(join(__dirname, 'register.html'));
});

app.use(express.static('public'));

io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});


let gameState = {
    choices: ["rock", "paper", "scissors", "well"],
    scores: {},
    played: {},
    results: [],
    lastPlayer: null,
    round: 1,
    players: {}
};

function determineWinner(players) {
    const [player1, player2] = Object.keys(players);
    const choice1 = players[player1];
    const choice2 = players[player2];
    
    if (choice1 === choice2) return 0; // Draw
    if ((choice1 === 'rock' && choice2 === 'scissors') ||
        (choice1 === 'scissors' && choice2 === 'paper') ||
        (choice1 === 'paper' && choice2 === 'rock') ||
        (choice1 === 'well')) {
        return player1; // Player 1 wins
    }
    return player2; // Player 2 wins
}

function playround(data, currentUser) {
    let winner = false;
    if (gameState.round >= 10) {
        gameState.round = 1;
        return 'finished'
    }
    if (currentUser === undefined) {
        console.log("current user undefined")
        return true;
    }
    if (!data.choice || !gameState.choices.includes(data.choice)) {
        console.log("no choice or invalid choice")
        return true;
    }
    if (gameState.lastPlayer === currentUser) {
        console.log("last player is current user")
        return true;
    }
    gameState.players[currentUser] = data.choice;
    gameState.lastPlayer = currentUser;
    console.log("-----playround----- \ngamestate: ", gameState, "\ndata: ", data, "\ncurrentUser: ", currentUser, "\n-------------------")
    console.log("test passed")
    console.log("gameState.players[currentUser]: ", gameState.players[currentUser], "\ndata.choice: ", data.choice)

    console.log(gameState.players);
    console.log(Object.keys(gameState.players));
    if (Object.keys(gameState.players).length === 2) {
        winner = determineWinner(gameState.players);
        gameState.results.push({ players: gameState.players, winner: winner, turn: gameState.round });
        gameState.players = {};
        gameState.lastPlayer = null;
        gameState.round += gameState.round + 1;

        if (winner in gameState.scores){
            gameState.scores[winner] += 1;
            console.log("gameState.scores: ", gameState.scores)

        }
        else {
            gameState.scores[winner] = 1;
            console.log("gameState.scores: ", gameState.scores)
        }
        return winner;
    }

    return false;
}



io.on('connection', (socket) => {
    console.log('a user connected');
    console.log('session: ' + socket.request.session.user);

    socket.playerId = Math.random().toString(36).substring(2);
    socket.emit("SWelcome", { player_id: socket.playerId, player_name: socket.request.session.user });
    socket.broadcast.emit("SNewPlayer", { player_name: socket.request.session.user });

    for (result in gameState.results){
        let lastResults = gameState.results.slice(-10);
        console.log("-------lastResults: \n", lastResults, '\n-------------------')
        for (let lastResult of lastResults){
            console.log("lastResult: ", lastResult)
            let players = lastResult.players;
            let winner = lastResult.winner;
            let turn = lastResult.turn;
            socket.emit("SResults", { players: players, winner: winner, turn: turn });
        }
        if (gamestate.scores) {
            socket.emit("SRestart", { message: "Welcome to the game here are the actual scores !", scores: gameState.scores})
        }
    }

    socket.on('CPlayerChoice', (data) => {
        const currentUser = socket.request.session.user;
        let result = playround(data, currentUser);
        console.log("result: ", result)
        console.log("gameState.results:", gameState.results)
        if (result === 'finished') {
            io.emit("SRestart", { message: "Game is finished", scores: gameState.scores });
            return;
        }
        if (result === true) {
            socket.emit('SCheat', { cheat: true });
            return;
        }
        if (result === false) {
            io.emit("SPlayerChoice", { player_name: currentUser, player_choice: data.choice });
        }
        else {
            let winner = result[0];
            let round_resutls = gameState.results[gameState.results.length-1]
            io.emit("SResults", { players: round_resutls.players, winner: round_resutls.winner, turn: round_resutls.turn});
        }
    });

    socket.on('disconnect', () => {
        console.log('user disconnected');
        socket.broadcast.emit("SPlayerDisconnected", { player_name: socket.request.session.user });
    });
});


server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
