const admin = require('firebase-admin');
const serviceAccount = require('/Users/davidcai/Desktop/blogbacklog-cb6c3df2e9a2.json'); //TODO temp path
const { DateTime } = require('luxon');
const mailgun = require("mailgun-js");
const DOMAIN = 'mail.blogbacklog.com';
const mailgunAPIKey = require('/Users/davidcai/Desktop/mailgun-api-key.json'); //TODO temp path
const mg = mailgun({apiKey: mailgunAPIKey.key, domain: DOMAIN});

// Firebase Initialization

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  
const db = admin.firestore();
const feedsRef = db.collection('feeds');

// Receive `now` to approximate a point-in-time run across multiple invocations
function shouldSend(lastSentSeconds, frequency, dayOfWeek, now) {
    let correctDate = true; // default to true in the event that there wasn't a previous send yet

    if (lastSentSeconds) {
        lastSent = DateTime.fromSeconds(lastSentSeconds._seconds);
        nextSend = lastSent.plus({days: frequency});

        correctDate = now.hasSame(nextSend, 'day');
    }
    
    correctDayOfWeek = now.weekday === dayOfWeek; //  Luxon: 1 is Monday, 7 is Sunday

    // console.log(lastSent.toISODate(), nextSend.toISODate(), correctDate, correctDayOfWeek);

    return (correctDate && correctDayOfWeek);
}

async function getFeedsToSend(now) {
    const snapshot = await feedsRef.where('isActive', '==', true).get();

    if (snapshot.empty) {
        console.log('No feeds to send at ', now.toISODate());
        return;
    };

    snapshot.forEach(doc => {
        console.log(doc.id, '=>', doc.data());
    });

    let toSend = [];
    snapshot.forEach(feed => {
        const schedule = feed.data().schedule;
        if (shouldSend(
            schedule.lastSent,
            schedule.frequency,
            schedule.dayOfWeek,
            now)) {
                toSend.push(feed);
        }
    });
    return (toSend);
}

function sendMail(toSend) {
    toSend.forEach(feed => {
        console.log("Sending", feed.id);
        const data = {
            from: 'Blog Backlog <send@mail.blogbacklog.com>',
            to: 'davidcai2012@gmail.com',
            subject: 'Hello',
            text: 'Feed ID: ' + feed.id,
        };
        mg.messages().send(data, function (error, body) {
            if (body) {
                console.log(body);
            }
            if (error) {
                console.log(error);
            }
        });
    });

    return (toSend);
}

function createUpdatedDatabaseEntry(feed, now) {
    var updatedFeed = { ... feed };
    
    if (feed.entries.length === 1) {
        updatedFeed.isActive = false;
    } else {
        // updatedFeed.schedule.lastSent = now.toISODate();
        // updatedFeed.entries = feed.entries.slice(1);
    }

    return (updatedFeed);
}

async function updateDatabaseWithSend(successfulSends, now) {
    // Get a new write batch
    // TODO: writes have a 500 item limit.
    const batch = db.batch();
    
    successfulSends.forEach(feed => {
        const feedRef = feedsRef.doc(feed.id);
        batch.update(feedRef, createUpdatedDatabaseEntry(feed.data(), now));
    });

    // Commit the batch
    await batch.commit();
}

async function processFeedsToSend(toSend, now) {
    const successfulSends = await sendMail(toSend);
    updateDatabaseWithSend(successfulSends, now);
}

async function start() {
    let now = DateTime.local();

    const toSend = await getFeedsToSend(now);
    if (toSend) {
        processFeedsToSend(toSend, now);
    }
}

start();