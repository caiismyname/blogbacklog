const firebaseAdmin = require("firebase-admin");
const functions = require("firebase-functions");
const { DateTime } = require("luxon");
const mailgun = require("mailgun-js");

const db = firebaseAdmin.firestore();
const feedsRef = db.collection("feeds");

// Mailgun Initialization
const mg = mailgun({
    apiKey: functions.config().mailgun.key,
    domain: functions.config().mailgun.domain,
});

// Receive `now` to approximate a point-in-time run across multiple invocations
function shouldSend(lastSentString, frequency, now) {
    let correctDate = true; // default to true in the event that there wasn't a previous send yet
    if (lastSentString) {
        const lastSent = DateTime.fromISO(lastSentString);
        const nextSend = lastSent.plus({ days: frequency });

        correctDate = now.hasSame(nextSend, "day");
    }

    return (correctDate);
}

async function getFeedsToSend(now) {
    const snapshot = await feedsRef.where("isActive", "==", true).get();

    if (snapshot.empty) {
        console.log("No feeds");
        return ([]);
    }

    const toSend = [];
    let totalFeedsCount = 0;
    snapshot.forEach((feed) => {
        totalFeedsCount += 1;
        const feedData = feed.data();
        feedData.id = feed.id;
        if (shouldSend(
            feedData.schedule.lastSent,
            feedData.schedule.frequency,
            now,
        )) {
            toSend.push(feedData);
        }
    });

    console.log(`${toSend.length} out of ${totalFeedsCount} feeds are sending.`);
    return (toSend);
}

function sendMail(toSend) {
    toSend.forEach((feed) => {
        console.log(`Sending feed ${feed.id}`);
        const data = {
            from: "Blog Backlog <send@mail.blogbacklog.com>",
            to: feed.recipientEmail,
            subject: `Delivery from ${feed.sourceTitle}`,
            text: `Your article: ${feed.entries[0]}\n\nUnsubscribe link: blogbacklog.com/unsubscribe/${feed.id}`,
        };
        mg.messages().send(data, (error, body) => {
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
    const updatedFeed = { ...feed };

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

    successfulSends.forEach((feed) => {
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
    const now = DateTime.local();

    const toSend = await getFeedsToSend(now);
    if (toSend) {
        processFeedsToSend(toSend, now);
    }
}

exports.mailDaemon = () => { start(); };
