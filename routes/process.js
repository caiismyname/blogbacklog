var express = require('express');
var router = express.Router();
const { DateTime } = require('luxon');

// Firebase Initialization
const admin = require('firebase-admin');
const serviceAccount = require('../blogbacklog-cb6c3df2e9a2.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Helpers

function cleanLinks(links) {
    const commaSplit = links.split(",");
    const cleaned = commaSplit.map(x => x.replace(" ", ""));

    return(cleaned);
}

function cleanDayOfWeek(dayString) {
    return(DateTime.fromFormat(dayString, "EEEE").weekday);
}

// Routes

router.get('/feed', (req, res, next) => {

});

router.post('/newFeed', async (req, res, next) => {
    const feedsRef = db.collection('feeds');
    
    console.log(req.body);
    const cleanedLinks = cleanLinks(req.body.links);
    const cleanedDayOfWeek = cleanDayOfWeek(req.body.dayOfWeek);

    await feedsRef.add({
      entries: cleanedLinks,
      schedule: {
        dayOfWeek: cleanedDayOfWeek,
        frequency: Number(req.body.frequency),
        lastSent: null,
      },
      isActive: true
    }).then(
        res.json('Feed added')
    );
});

module.exports = router;