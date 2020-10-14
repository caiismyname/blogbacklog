var express = require('express');
var router = express.Router();
const { DateTime } = require('luxon');
var domParser = require('html-dom-parser');
const request = require('request'); // Anyone know if these should be var or const?

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

// Merges two dicts assuming values are all lists
function mergeDicts(a,b) {
    const result = { ...a};
    
    for (key in b) {
        if (key in result) {
            result[key] = result[key].concat(b[key]);
        } else {
            result[key] = b[key];
        }
    }

    return(result);
}

function traverser(node, depth) {
    // console.log("Traversing ---------------");
    var res = {};   // key = depth, val = list of links found at that depth
                    // Use a dict to avoid a sparse array.

    for (childIdx in node.children) {
        const child = node.children[childIdx];
        // console.log(child.name);
        // console.log(child.type);
        if (child.name === 'a') {
            // console.log(child.attribs);
            if (depth in res) {
                res[depth].push(child.attribs.href);
            } else {
                res[depth] = [child.attribs.href];
            }
        }
        const childrenResults = traverser(child, depth + 1);

        res = mergeDicts(res, childrenResults);
    }

    return(res);
}

function findRoot(parsed) {
    var candidates = [];

    for (item of parsed) {
        if ('children' in item) {
            candidates.push(item);
        }
    }

    return(candidates);
}

async function parseWebpage(url) {
    request(url, (err, res, body) => {
        const nodes = findRoot(domParser(body));
        var foundLinks = {};

        for (node of nodes) {
            foundLinks = mergeDicts(foundLinks, traverser(node, 0));
        }

        console.log(foundLinks);
    });
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

router.post('/parseUrl', async (req, res, next) => {
    url = req.body.url;
    parseWebpage(url).then(
        res.send(400) // temp
    );

});

module.exports = router;