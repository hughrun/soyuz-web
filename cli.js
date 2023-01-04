const { argv } = require('node:process');
const { addUser, resetPassword } = require('./utilities')

function userCreate(username, directory) {
    if (!username || !directory) {
        console.log('    User-create requires a username and directory.')
        console.log('    e.g. `user-create sam gemini.example.com`.\n')
    } else {
        addUser(username, directory, password => {
            console.log(`    User ${username} created with password ${password}`)
            console.log('    Keep it secret, keep it safe.\n')
        })
    }
}

function passwordReset(username) {
    if (!username) {
        console.log('    User-create requires a username.')
        console.log('    e.g. `password-reset sam`.\n')
    } else {
        resetPassword(username, null, password => {
            console.log(`    Password for ${username} is now ${password}`)
            console.log('    Keep it secret, keep it safe.\n')
    })
}
}

// TODO: delete user from database, (and user's files?)

switch (argv[2]) {
    case 'user-create':
        userCreate(argv[3], argv[4]);
        break;
    case 'password-reset':
        passwordReset(argv[3]);
        break;
    default:
        console.log('    Command not recognised.')
        console.log('    Possible commands are `user-create` or `password-reset`\n')
}
