const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const app = express();
const apiPort = 4048;

// setup express app
app.use(compression({threshold:0}));
app.use(bodyParser.urlencoded({extended: true}));
app.use(cors());
app.use(bodyParser.json());
app.use(helmet());

// routes init
const routes = require('./routes');

// outputs
app.use('/', routes);

app.listen(apiPort, function() {
	console.log(`Server is running on port ${apiPort}`);
})