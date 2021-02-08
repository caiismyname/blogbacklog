const admin = require('firebase-admin');
const { DateTime } = require('luxon');
const mailgun = require("mailgun-js");
const DOMAIN = 'mail.blogbacklog.com';
const dotenv = require("dotenv");

// Firebase Initialization
dotenv.config()
const serviceAccount = {
    "type": process.env.FIREBASE_TYPE,
    "project_id": process.env.FIREBASE_PROJECT_ID,
    "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
    "private_key": process.env.FIREBASE_PRIVATE_KEY,
    "client_email": process.env.FIREBASE_CLIENT_EMAIL,
    "client_id": process.env.FIREBASE_CLIENT_ID,
    "auth_uri": process.env.FIREBASE_AUTH_URI,
    "token_uri": process.env.FIREBASE_TOKEN_URI,
    "auth_provider_x509_cert_url": process.env.FIREBASE_AUTH_PROVIDER_x509_CERT_URL,
    "client_x509_cert_url": process.env.FIREBASE_AUTH_CLIENT_x509_CERT_URL,
};

// Fix Firebase private key
const privateKeySplit = process.env.FIREBASE_PRIVATE_KEY.split("\\n");
var fixedPrivateKey = "";
for (portion of privateKeySplit) {
    fixedPrivateKey = fixedPrivateKey + portion + "\n";
}
serviceAccount.private_key = fixedPrivateKey

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// Mailgun Initialization
const mg = mailgun({apiKey: process.env.MAILGUN_KEY, domain: DOMAIN});
  
const db = admin.firestore();
const feedsRef = db.collection('feeds');

// Receive `now` to approximate a point-in-time run across multiple invocations
function shouldSend(lastSentString, frequency, now) {
    let correctDate = true; // default to true in the event that there wasn't a previous send yet
    if (lastSentString) {
        lastSent = DateTime.fromISO(lastSentString);
        nextSend = lastSent.plus({days: frequency});

        correctDate = now.hasSame(nextSend, 'day');
    }

    // console.log(lastSent.toISODate(), nextSend.toISODate(), correctDate);

    return (correctDate);
}

async function getFeedsToSend(now) {
    const snapshot = await feedsRef.where('isActive', '==', true).get();

    if (snapshot.empty) {
        console.log('No feeds');
        return;
    };

    // snapshot.forEach(doc => {
    //     console.log(doc.id, '=>', doc.data());
    // });

    let toSend = [];
    var totalFeedsCount = 0;
    snapshot.forEach(feed => {
        totalFeedsCount += 1;
        const feedData = feed.data();
        feedData.id = feed.id;
        if (shouldSend(
            feedData.schedule.lastSent,
            feedData.schedule.frequency,
            now)) {
                toSend.push(feedData);
        }
    });

    console.log(toSend.length + " out of " + totalFeedsCount + " feeds are sending.");
    return(toSend);
}

function sendMail(toSend) {
    toSend.forEach(feed => {
        console.log("Sending feed " + feed.id);
        const data = {
            from: 'Blog Backlog <send@mail.blogbacklog.com>',
            to: feed.recipientEmail,
            subject: 'Delivery from ' + feed.sourceTitle,
            text: 'Your article: ' + feed.entries[0] + "\n\n" + "Unsubscribe link: blogbacklog.com/unsubscribe/" + feed.id,
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
        updatedFeed.schedule.lastSent = now.toISODate();
        updatedFeed.entries = feed.entries.slice(1);
    }

    return (updatedFeed);
}

async function updateDatabaseWithSend(successfulSends, now) {
    // Get a new write batch
    // TODO: writes have a 500 item limit.
    const batch = db.batch();
    
    successfulSends.forEach(feed => {
        const feedRef = feedsRef.doc(feed.id);
        batch.update(feedRef, createUpdatedDatabaseEntry(feed, now));
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