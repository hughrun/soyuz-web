const express = require('express')

const { getLatestPost, getNow, publishNewPost, requireLoggedIn, resetPassword, saveFile, updatePost, verifyUser, getSavedFile } = require('./utilities')

const bodyParser = require('body-parser')
const Database = require('better-sqlite3');
const session = require('express-session')
const SqliteStore = require("better-sqlite3-session-store")(session)
const sprightly = require('sprightly');

// configure Express
const app = express()
const PORT = process.env.SOYUZ_PORT
app.use(bodyParser.urlencoded({ extended: false }))
app.use(express.static('static'))

// configure session store
db = new Database('soyuz.db', {});
app.use(
  session({
    store: new SqliteStore({
      client: db,
      expired: {
        clear: true,
        intervalMs: 900000 //ms = 15min
      }
    }),
    saveUninitialized: false,
    secret: process.env.SOYUZ_SESSION_SECRET,
    resave: false,
    cookie: {
        sameSite: 'strict',
        maxAge: 1.21e+9 // 2 weeks
    },
    name: 'soyuz-web'
  })
)

// configure template engine
app.engine('spy', sprightly);
app.set('views', './templates');
app.set('view engine', 'spy');

/**
 * ROUTES
 */

// GET

app.get('/', requireLoggedIn, (req, res) => {
    res.render('index.spy', {title: 'Home', writeNew: getSavedFile(req.session.user.username)? 'Return to draft' : 'New'})
})

app.get('/login', (req, res) => {
    if (req.session.user) {
        res.redirect('/')
    } else {
        res.render('login.spy', {title: 'Log In'})
    }
})

app.get('/new', requireLoggedIn, (req, res) => {
    let message = getSavedFile(req.session.user.username) || "# Title of my note"
    let data = {
        title: 'New post',
        disabled: '',
        message: message
    }
    let today = getNow().toISOString().slice(0,10)
    // check whether user has already posted today
    return getLatestPost(req.session.user.directory, true, (dateString)=> {
        if (today === dateString) {
            data.disabled = 'disabled'
            data.message = `Relax, ${req.session.user.username}, you have already posted today.`
        }
        res.render('new.spy', data)
    })
})

app.get('/edit', requireLoggedIn, (req, res) => {
    return getLatestPost(req.session.user.directory, true, (dateString) => {
        if (dateString) {
            return getLatestPost( req.session.user.directory, false, (message, path) => {
                res.render('edit.spy', {message: message, path: path, title: 'Edit'})
            })
        } else {
            res.redirect('/new')
        }
    })
})

app.get('/settings', requireLoggedIn, (req, res) => {
    res.render('settings.spy', {title: 'Settings'})
})

app.get('/try-again', requireLoggedIn, (req, res, next) => {
    res.render('try-again.spy', {title: 'Log In'})
})

app.get('/help', requireLoggedIn, (req, res, next) => {
    res.render('help.spy', {title: 'Help'})
})

app.get('/published', requireLoggedIn, (req, res, next) => {
    res.render('published.spy', {title: 'You published a note!'})
})

// POST

app.post('/login', verifyUser,
    function(req, res){
        if (req.session.user) {
            res.redirect('/')
        } else {
            res.redirect('/try-again')
        }
})

app.post('/logout', function(req, res, next){
    req.session.destroy( (err) => {
        if (err) {console.error(err)}
        res.redirect('/login')
    })
})

app.post('/publish', requireLoggedIn, (req, res) => {
    publishNewPost(req, () => {
        res.redirect('/published')
    })
})

app.post('/save', requireLoggedIn, (req, res) => {
    saveFile(req.session.user.username, req.body.textarea, () => {
        res.redirect('/new')
    })
})

app.post('/update', requireLoggedIn, (req, res) => {
    updatePost(req, () => {
        res.redirect('/')
    })
})

app.post('/reset-password', requireLoggedIn, (req, res) => {
    resetPassword(req.session.user.username, req.body.password, password => {
        return req.session.destroy( (err) => {
            if (err) {console.error(err)}
            res.redirect('/login')
        })
    })
})

/**
 * Let's go!
 */
app.listen(PORT, () => {
  console.log(`Soyuz Web listening on port ${PORT}`)
})
