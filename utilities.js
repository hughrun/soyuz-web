const GEMINI_PATH = process.env.GEMINI_PATH
const Database = require("better-sqlite3")
const {mkdir, readFile, writeFile} = require('node:fs')
const { pbkdf2, randomBytes } = require('node:crypto')
db = new Database('soyuz.db', {})

function getNow() {
    // we want to be able to use toISOString but that always returns
    // the date in UTC timezone. Here we adjust the UTC date to align
    // with the local timezone
    let localNow = new Date()
    let now = new Date(localNow.getTime() - localNow.getTimezoneOffset()*60000)
    return now
}

// DATABASE FUNCTIONS
const addUser = function(username, directory, callback){

    let buf = randomBytes(32);
    let salt = buf.toString('hex');
    let pbuf = randomBytes(16);
    let password = pbuf.toString('hex');
    directory = directory.toString()

    // prepare db table
    let createTable = db.prepare(
        'CREATE TABLE IF NOT EXISTS users (username TEXT UNIQUE, password TEXT, salt TEXT, directory TEXT UNIQUE, latest_post TEXT, saved_post TEXT)'
        );
    createTable.run();

    // save to db
    pbkdf2(password, salt, 310000, 32, 'sha512', (err, derivedKey) => {
        if (err) throw err;
        let hash =  derivedKey.toString('hex');
        let stmt = db.prepare(
            'INSERT INTO users (username, directory, password, salt, saved_post) VALUES (?, ?, ?, ?, ?)'
            );
        stmt.run(username, directory, hash, salt, null);
        return callback(password)
        });
}

const resetPassword = function(username, pass, callback) {

    let buf = randomBytes(32)
    let salt = buf.toString('hex')
    let password
    if (pass) {
        password = pass
    } else {
        let pbuf = randomBytes(16)
        password = pbuf.toString('hex')
    }

    pbkdf2(password, salt, 310000, 32, 'sha512', (err, derivedKey) => {
        if (err) throw err;
        let hash =  derivedKey.toString('hex');
        let stmt = db.prepare(
            'UPDATE users SET password = ?, salt = ? WHERE username = ?'
            );
        stmt.run(hash, salt, username);
        return callback(password)
     });
}

// AUTHORISATION MIDDLEWARE
const verifyUser = function (req, res, next) {
    let username = req.body.username
    let password = req.body.password
    let stmt = db.prepare(
        'SELECT * FROM users WHERE username = ?'
        )
     user = stmt.get(username)

    if (!user) {
        return next()
    }

    pbkdf2(password, user.salt, 310000, 32, 'sha512', function(err, hashedPassword) {
        if (err) {
            return next()
        }
        if (user.password !== hashedPassword.toString('hex')) {
            return next()
        }
        req.session.user = {
            username: user.username,
            directory: user.directory
        }
        next()
    });
}

const requireLoggedIn = function(req, res, next) {
    if (req.session.user) {
        return next()
    } else {
        return res.redirect('/login')
    }
}

// PUBLISHING
const publishNewPost = function(req, cb) {
    let post = req.body.textarea
    let title = req.body.textarea.split('\n')[0].split('# ')[1].trim()
    let year = getNow().toISOString().slice(0,4)
    let dateString = getNow().toISOString().slice(0,10)
    let yearDir = `${GEMINI_PATH}/${req.session.user.directory}/${year}`
    let fileName = `${GEMINI_PATH}/${req.session.user.directory}/${year}/${dateString}.gmi`

    function updateArchivePage() {
        // update or create year's archive page
        let yearIndex = `${GEMINI_PATH}/${req.session.user.directory}/${year}/index.gmi`
        let updated = ''
        readFile(yearIndex, {encoding: 'utf8'}, (err, data) => {
            // if the file doesn't exist, create it
            if (err) {
                if (err.code == 'ENOENT') {
                    let string = `# ${year} Notes\n\n=> ${dateString}.gmi ${dateString} (${title})\n`
                    writeFile(yearIndex, string, (err) => {
                        if (err) throw err;
                    })
                }
                else {
                    throw err
                }
            } else {
                let lines = data.split('\n')
                lines[1] = `\n=> ${dateString}.gmi ${dateString} (${title})`
                updated = lines.join('\n')
            }

            writeFile(yearIndex, updated, (err) => {
                if (err) throw err
            })
        })
        // clear any saved post now that it is published
        saveFile(req.session.user.username, null, () => {
            return cb()
        })
    }

    function updateIndexListing() {
        // update index.gmi listing
        let indexFile = `${GEMINI_PATH}/${req.session.user.directory}/index.gmi`
        readFile(indexFile, {encoding: 'utf8'}, (err, data) => {
            if (err) {
                // if the file doesn't exist, create it
                if (err.code == 'ENOENT') {
                    let string = `## Latest notes\n\n=> /${year}/${dateString}.gmi ${dateString} (${title})\n`
                    writeFile(indexFile, string, (err) => {
                        if (err) throw err;
                    })
                }
            } else {
                let links = data.split('## Latest notes')
                let lines = links[1].trimStart().split('\n')
                // remove the oldest item
                if (lines[4].startsWith('=>')) {
                    lines.splice(4,1)
                }
                // add new post at top of list
                lines.unshift(`## Latest notes\n\n=> /${year}/${dateString}.gmi ${dateString} (${title})`)
                // add back everything preceeding latest notes
                lines.unshift(`${links[0].trimEnd()}\n`) // because we join with a newline we need to remove one here
                updated = lines.join('\n')
                writeFile(indexFile, updated, (err) => {
                    if (err) {
                        // if the directory doesn't exist, create it and try again
                        if (err.code == 'ENOENT') {
                            mkdir(yearDir, (err) => {
                                if (err) throw err;
                                writeFile(indexFile, updated, (err) => {
                                    if (err) throw err;
                                })
                            })
                        }
                    }
                })
            }
        })
        return updateArchivePage()
    }

    writeFile(fileName, post, (err) => {
        if (err) {
            // if the directory doesn't exist, create it and try again
            if (err.code == 'ENOENT') {
                mkdir(yearDir, (err) => {
                    if (err) throw err;
                    writeFile(fileName, post, (err) => {
                        if (err) throw err;
                    })
                })
            }
        }
        return updateIndexListing()
    })
}

let getLatestPost = function(directory, dateOnly, callback) {
    // we check the index file because
    // a new post could have come from
    // somewhere other than the app
    // e.g. from a CLI on a laptop etc
    let indexFile = `${GEMINI_PATH}/${directory}/index.gmi`
    readFile(indexFile, {encoding: 'utf8'}, (err, data) => {
        if (err) {
            if (err.code == 'ENOENT') {
                return callback(null)
            }
            else {
                throw err
            }
        }

        if (data.length == 0 || data == null) {
            return callback(null)
        }

        let links = data.split('## Latest notes')
        let parts = links[1].split('\n')[2].split(' ')
        let filePath = `${GEMINI_PATH}/${directory}/${parts[1]}`
        if (dateOnly) {
            let dateString = filePath.slice(-14,-4)
            return callback(dateString)
        } else {
            readFile(filePath, {encoding: 'utf8'}, (err, file) => {
                if (err) throw err;
                return callback(file, filePath)
            })
        }
    })
}

let updatePost = function(req, callback) {
    let contents = req.body.textarea
    let path = req.body.path
    let title = contents.split('\n')[0].split('# ')[1].trim()
    let year = getNow().toISOString().slice(0,4)
    let indexFile = `${GEMINI_PATH}/${req.session.user.directory}/index.gmi`
    let yearIndex = `${GEMINI_PATH}/${req.session.user.directory}/${year}/index.gmi`
    let relative_path = path.slice(-20)
    let post_date = relative_path.slice(6,16)
    let prefix = `=> ${relative_path} ${post_date}`
    let archivePrefix = `=> ${relative_path.slice(6)} ${post_date}`
    let updated = ''

    // we update the index and archive listings in case the title has changed
    readFile(indexFile, {encoding: 'utf8'}, (err, data) => {
        if (err) {
            throw err;
        } else {
            let links = data.split('## Latest notes')
            let lines = links[1].split('\n')
            lines[0] = '## Latest notes'
            lines[2] = `${prefix} (${title})`
            updated = links[0] + lines.join('\n')
            // update index on homepage
            writeFile(indexFile, updated, (err) => {
                if (err) throw err
                readFile(yearIndex, {encoding: 'utf8'}, (err, data) => {
                    if (err) {
                        throw err
                    } else {
                        let lines = data.split('\n')
                        lines[2] = `${archivePrefix} (${title})`
                        updated = lines.join('\n')
                        // update archive page
                        writeFile(yearIndex, updated, (err) => {
                            if (err) throw err
                            //write out the updated post
                            writeFile(path, contents, (err) => {
                                if (err) {
                                    if (err) throw err;
                                }
                                return callback()
                            })
                        })
                    }
                })
            })
        }
    })
}

// NOTE: this refers to saving the file on the database, not publishing the file to the server
let saveFile = function(user, text, callback) {
    let stmt = db.prepare(
        'UPDATE users SET saved_post = ? WHERE username = ?'
        );
    saved = stmt.run(text, user);
    return callback();
}

let getSavedFile = function(user) {
    let stmt = db.prepare(
        'SELECT saved_post FROM users WHERE username = ?'
        )
    stmt.pluck(true)
    let post = stmt.get(user)
    return post
}

// TODO:
let savePictures = async function(text) {
    // we will need to save pictures to the server
    // separately when publishing
}

module.exports = {
    addUser: addUser,
    getLatestPost: getLatestPost,
    getNow: getNow,
    getSavedFile: getSavedFile,
    publishNewPost: publishNewPost,
    resetPassword: resetPassword,
    requireLoggedIn: requireLoggedIn,
    saveFile: saveFile,
    updatePost: updatePost,
    verifyUser: verifyUser
}
