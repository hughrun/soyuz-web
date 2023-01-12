Soyuz (Союз - 'union') connects the web and gemini.

This repository is for `soyuz-web`, an Express web application for publishing from the web to Gemini capsules.

There will soon be a sister-repository, `soyuz-cli` for publishing from the command line on Unix-like systems. You do not have to use `soyuz-cli` to use `soyuz-web`, and in multi-user systems, definitely shouldn't.

Soyuz is named after the Russian spacecraft.

## Dependencies

* sqlite3
* nodejs

`soyuz-web` has only been tested on Mac and Linux.

## Assumptions

Soyuz is simple web app for writing Gemini posts, not a Gemini server. It is assumed that:

* you are using a Gemini server (e.g. Agate)
* the server user running `soyuz-web` has access to read and write files in each Gemini 'capsule' (site).
* 'world/other' has read access to the Gemini capsule(s)

The second point means that you can _either_:

1. use soyuz-web for multiple users to publish Gemini posts, as long as they only use soyuz-web; _or_
2. use soyuz-web for a single user, who can also publish via other means (e.g. rsync or soyuz-cli), as long as that user is running the soyuz-web service.

## Configuration

Environment Variables required are:

* SOYUZ_PORT (the port you want to run your app on)
* GEMINI_PATH (root path for Gemini capsules)
* SOYUZ_SESSION_SECRET (a random string or passphrase to secure session cookies)

You may set these however you like, but systemd is recommended. If you are contributing to the project, you can pick up envs in development via a simple `rundev` shell script by running `npm run dev`. You can find examples at `soyuz-web.service` and `rundev_example`. Do not copy the example `SOYUZ_SESSION_SECRET`!

## Commands

* `npm start` - start the Express app
* `npm run user-create USERNAME DIRECTORY` - create a new user `USERNAME` with capsule files stored at `DIRECTORY`. The `DIRECTORY` is relative to `GEMINI_PATH` and should be the name of the directory used by the user's Gemini "capsule". This command will provide an initial password in plaintext that you can provide to the user.

e.g. `npm run user-create Hugh gemini.example.com` would create a new user `Hugh` and expect Hugh's Gemini capsule to be saved at `$GEMINI_PATH/gemini.example.com`
* `npm run password-reset USERNAME` - reset the password for user `USERNAME`. This command will return the password in plaintext on the command line.

# Setup

## Create user (if not already created)

1. Create a dedicated user to run the app: `add user --disabled-login gemini`
2. Swith to user and home directory `su gemini && cd /home/gemini`

## Install latest code and dependencies

3. You must be running nodejs v18.x or higher
4. Download: `git clone https://github.com/hughrun/soyuz-web.git`
5. Install npm modules: `npm install`

## Set up systemd unit files (optional)

6. Edit the `soyuz-web/soyuz-web.service` file, checking you are using the port number, directory, and user you want, and have a strong session secret.
7. Copy systemd unit file to where systemd expects to see it: `cp soyuz-web/soyuz-web.service /etc/systemd/system/`
5. `systemctl daemon-reload`
6. `systemctl enable soyuz-web`

## Set up web server (e.g. nginx)

7. Edit `soyuz.nginx` and replace `example.com` with your own domain. Check the port number matches your systemd file.
8. `cp soyuz.nginx /etc/nginx/sites-available/soyuz`
9. `ln -s /etc/nginx/sites-available/soyuz /etc/nginx/sites-enabled/`
10. `systemctl reload nginx`

## Secure your site with TLS from Lets Encrypt

11. `certbot --nginx`

## Start systemd service

12. `systemctl start soyuz-web`

## Create user

13. `npm run user-create sam example.com`
