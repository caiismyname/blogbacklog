const express = require("express");
const functions = require("firebase-functions");
// const cors = require('cors');
const PORT = 4001;

const createError = require("http-errors");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");

const app = express();
const indexRouter = require("./routes/index");
const { processRouter } = require("./routes/process");
const { unsubscribeRouter } = require("./routes/unsubscribe");
const { mailDaemon } = require("./mail-daemon");

// App + Router initialization

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use("/", indexRouter);
app.use("/process", processRouter);
app.use("/unsubscribe", unsubscribeRouter);

app.listen(PORT, () => {
    console.log(`Server is running on Port: ${PORT}`);
});

// catch 404 and forward to error handler
app.use((req, res, next) => {
    next(createError(404));
});

// error handler
app.use((err, req, res) => {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get("env") === "development" ? err : {};

    res.status(err.status || 500);
    res.render("error");
});

exports.app = functions.https.onRequest(app);

exports.mailDaemon = functions.pubsub
    .schedule("every day 04:00")
    .timeZone("America/New_York")
    .onRun(() => {
        console.log("Running maildeamon");
        mailDaemon();
        return null;
    });
