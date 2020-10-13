const express = require('express');
const bodyParser = require('body-parser');
// const cors = require('cors');
const PORT = 4000;
const admin = require('firebase-admin');
const serviceAccount = require('./blogbacklog-cb6c3df2e9a2.json');

var createError = require('http-errors');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

const app = express();
var indexRouter = require('./routes/index');
var processRouter = require('./routes/process');

// App + Router initialization

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/process', processRouter);

app.listen(PORT, function() {
    console.log("Server is running on Port: " + PORT);
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  res.status(err.status || 500);
  res.render('error');
});

// Firebase Initialization

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

module.exports = app;