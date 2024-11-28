const uuid = require('uuid');
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const path = require('path');
const port = 3000;
const fs = require('fs');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const SESSION_KEY = 'authorization';

class Session {
    #sessions = {}

    constructor() {
        try {
            this.#sessions = fs.readFileSync('./sessions.json', 'utf8');
            this.#sessions = JSON.parse(this.#sessions.trim());

            console.log(this.#sessions);
        } catch(e) {
            this.#sessions = {};
        }
    }

    #storeSessions() {
        fs.writeFileSync('./sessions.json', JSON.stringify(this.#sessions, null, 2), 'utf-8');
    }

    set(key, value) {
        if (!value) {
            value = {};
        }
        this.#sessions[key] = value;
        this.#storeSessions();
    }

    get(key) {
        return this.#sessions[key];
    }

    init() {
        const sessionId = uuid.v4();
        console.log("GENERATE", sessionId)
        return sessionId;
    }

    destroy(sessionId) {
        delete this.#sessions[sessionId];
        console.log("RESTROY", sessionId)
        this.#storeSessions();
    }
}

const sessions = new Session();

app.use((req, res, next) => {
    const token = req.headers[SESSION_KEY];
    if (token) {
        req.session = sessions.get(token);
        req.sessionId = token;
    }

    next();
});

app.get('/', (req, res) => {
    console.log("GET", req.session, req.sessionId)
    if (req.session) {
        if (req.session.username){
            return res.json({
                username: req.session.username,
                logout: 'http://localhost:3000/logout'
            })
        }
    }
    res.sendFile(path.join(__dirname+'/index.html'));
})

app.post('/api/tokenfromcode', async (req, res) => {
    const code = req.body.code;
    if (code) {
        const options = {
            method: 'POST',
            url: 'https://dev-7sfm4dwi0agzg42e.us.auth0.com/oauth/token',
            headers: {'content-type': 'application/x-www-form-urlencoded'},
            data: {
                grant_type: 'authorization_code',
                client_id: '2rt9zMZergxHgi7SqMDSo2nBLXw2gHV3',
                client_secret: 'UhwrkkaOHZ8jLwirvoivMAG8n1AeEe6NfI1itImdyjEbAzsygoo0Pjizl_HuYRD6',
                code: code,
                redirect_uri: 'http://localhost:3000',
            }
        };

        try {
            const response = await axios(options);
            const decoded = jwt.decode(response.data.id_token);

            const sessionId = response.data.access_token;
            const currentSession = {"username": decoded.email, "refresh":response.data.refresh_token};

            sessions.set(sessionId, currentSession);
            res.json({ token: response.data.access_token });
        
        } catch (error) {
            console.error('Error exchanging code for token', error.response ? error.response.data : error.message);
            res.status(500).send('Authentication failed');
        }
    }
});

app.get('/logout', (req, res) => {
    console.log("LOGOUT", req.sessionId)
    sessions.destroy(req.sessionId);
    res.redirect('/');
});

app.post('/api/login', async (req, res) => {
    const { login, password } = req.body;
    console.log("LOGIN", login, password);

    const options = {
        method: 'POST',
        url: 'https://dev-7sfm4dwi0agzg42e.us.auth0.com/oauth/token',
        headers: {'content-type': 'application/x-www-form-urlencoded'},
        data: {
            grant_type: 'password',
            audience: 'https://dev-7sfm4dwi0agzg42e.us.auth0.com/api/v2/',
            client_id: '2rt9zMZergxHgi7SqMDSo2nBLXw2gHV3',
            client_secret: 'UhwrkkaOHZ8jLwirvoivMAG8n1AeEe6NfI1itImdyjEbAzsygoo0Pjizl_HuYRD6',
            username: login,
            password: password,
            scope: 'offline_access'
        }
    }

    try {
        const response = await axios(options);
        console.log(response.data);

        const sessionId = response.data.access_token;
        const currentSession = {"username": login, "refresh":response.data.refresh_token}
        sessions.set(sessionId, currentSession);
        res.json({ token: sessionId });

    } catch (error) {
        console.error('Error getting user token', error.response ? error.response.data : error.message);
        res.status(401).send();
    }
});

app.post('/api/signup', async (req, res) => {
    const { login, password } = req.body;
    console.log("SIGNUP", login, password);

    try {
        const optionsGetToken = {
            method: 'POST',
            url: 'https://dev-7sfm4dwi0agzg42e.us.auth0.com/oauth/token',
            headers: {'content-type': 'application/x-www-form-urlencoded'},
            data: {
                audience: 'https://dev-7sfm4dwi0agzg42e.us.auth0.com/api/v2/',
                grant_type : 'client_credentials',
                client_id : '2rt9zMZergxHgi7SqMDSo2nBLXw2gHV3',
                client_secret : 'UhwrkkaOHZ8jLwirvoivMAG8n1AeEe6NfI1itImdyjEbAzsygoo0Pjizl_HuYRD6',
            }
        }

        const tokenData = await axios(optionsGetToken);
        const token = tokenData.data.access_token;

        const optionsCreateUser = {
            method: 'POST',
            url: 'https://dev-7sfm4dwi0agzg42e.us.auth0.com/api/v2/users',
            headers: {
                'authorization': `Bearer ${token}`,
                'content-type': 'application/json'
              },
            data: {
                email: login,
                password: password,
                connection: 'Username-Password-Authentication',
            }
        }

        const newUser = await axios(optionsCreateUser);
        res.json({ new_user: login });//TODO Custom Success Msg
        console.log(newUser.data)
    } catch (error) {
        console.error('Error creating user', error.response ? error.response.data : error.message);
        res.status(409).send();
    }
});

app.post('/api/refresh', async (req, res) => {//BTA
    console.log("REFRESH", req.sessionId);

    const options = {
        method: 'POST',
        url: 'https://dev-7sfm4dwi0agzg42e.us.auth0.com/oauth/token',
        headers: {'content-type': 'application/x-www-form-urlencoded'},
        data: {
            grant_type: 'refresh_token',
            client_id : '2rt9zMZergxHgi7SqMDSo2nBLXw2gHV3',
            client_secret : 'UhwrkkaOHZ8jLwirvoivMAG8n1AeEe6NfI1itImdyjEbAzsygoo0Pjizl_HuYRD6',
            refresh_token : req.session.refresh_token,
        }
    }

    try {
        const response = await axios(options);
        console.log(response.data);

        const refreshedToken = response.data.access_token_token;
        const currentSession = req.session;

        sessions.destroy(req.sessionId);
        sessions.set(refreshedToken, currentSession);
        res.json({ token: refreshedToken });

    } catch (error) {
        console.error('Error getting refreshing token', error.response ? error.response.data : error.message);
        res.status(401).send();
    }
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
