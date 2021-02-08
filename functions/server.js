const express = require('express');
const functions = require('firebase-functions');
// const cors = require('cors');
const PORT = 4000;

var createError = require('http-errors');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

const app = express();
indexRouter = require('./routes/index');
const { processRouter } = require('./routes/process');
const { unsubscribeRouter } = require('./routes/unsubscribe');

// App + Router initialization

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/process', processRouter);
app.use('/unsubscribe', unsubscribeRouter);

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

// module.exports = app;
exports.app = functions.https.onRequest(app);