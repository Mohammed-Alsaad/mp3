// Get the packages we need
var express = require('express'),
    router = express.Router(),
    mongoose = require('mongoose'),
    bodyParser = require('body-parser');

// Read .env file
require('dotenv').config();

// Create our Express application
var app = express();

// Use environment defined port or 3000
var port = process.env.PORT || 3000;

// Connect to a MongoDB --> Uncomment this once you have a connection string!!
mongoose.connect(process.env.MONGODB_URI,  { useNewUrlParser: true });

// Allow CORS so that backend and frontend could be put on different servers
var allowCrossDomain = function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "POST, GET, PUT, DELETE, OPTIONS");
    next();
};
app.use(allowCrossDomain);

// Use the body-parser package in our application
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.text({ type: 'text/plain' }));

// Convert text/plain JSON strings
app.use((req, res, next) => {
  if (typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body);
    } catch {
      // leave as is
    }
  }
  next();
});

// Normalize form-encoded and stringified values
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    for (const key in req.body) {
      const val = req.body[key];
      if (typeof val === 'string') {
        const lower = val.toLowerCase();
        if (lower === 'true') req.body[key] = true;
        else if (lower === 'false') req.body[key] = false;
        else if (!isNaN(val) && val.trim() !== '') req.body[key] = Number(val);
      }
    }
  }
  next();
});

// Use routes as a module (see index.js)
require('./routes')(app, router);

// Start the server
app.listen(port);
console.log('Server running on port ' + port);
