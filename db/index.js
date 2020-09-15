const pgp = require('pg-promise')()
const pgNative = require('pg-native');

const dbHost = 'localhost';
const dbPort = 5432;
const dbDatabase = 'database';
const dbUsername = 'username';
const dbPassword = 'password';

const Async = pgp({
	host: dbHost,
	port: dbPort,
	database: dbDatabase,
	user: dbUsername,
	password: dbPassword
});

const Sync = new pgNative()
Sync.connect(`postgresql://${dbUsername}:${dbPassword}@${dbHost}:${dbPort}/${dbDatabase}`, function(err) {})

module.exports = { Async, Sync };