var express = require('express');
var router = express.Router();
const { DateTime } = require('luxon');
var domParser = require('html-dom-parser');
const request = require('request'); // Anyone know if these should be var or const?
const dotenv = require("dotenv");

// Firebase Initialization
const admin = require('firebase-admin');
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

const db = admin.firestore();

// Helpers
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

function cleanLinks(links, baseUrl) {
    var cleanedLinks = [];
    if (baseUrl.slice(-1) !== "/") {
        baseUrl = baseUrl.concat("/");
    }

    for (idx in links) {
        var link = links[idx];
        link = link.replace(" ", "");

        if (link.slice(0,4) !== "http") {
            if (link.slice(0,1) !== "/") {
                link = baseUrl + link;
            } else {
                link = baseUrl + link.slice(1);
            }
        }
        
        if (!(cleanedLinks.includes(link))) {
            cleanedLinks.push(link);
        }
    }

    return(cleanedLinks);
}

function cleanTitle(baseUrl) {
    const start = baseUrl.indexOf("://");
    if (start === -1) {
        return(baseUrl);
    }

    var cleaned = "";
    var cur = start + 3;
    while (baseUrl[cur] !== "/" && baseUrl[cur] !== "?" && cur < baseUrl.length) {
        cleaned += baseUrl[cur];
        cur += 1;
    }

    console.log(cleaned);
    return(cleaned);
}

async function parseWebpage(url, callback) {
    request(url, (err, res, body) => {
        const nodes = findRoot(domParser(body));
        var foundLinks = {};

        for (node of nodes) {
            foundLinks = mergeDicts(foundLinks, traverser(node, 0));
        }

        var candidateLinks = [];
        var maxFoundLength = -1;

        for (key in foundLinks) {
            if (foundLinks[key].length > maxFoundLength) {
                candidateLinks = foundLinks[key];
                maxFoundLength = foundLinks[key].length;
            }
        }

        const cleanedLinks = cleanLinks(candidateLinks, url);
        console.log(cleanedLinks);
        callback(cleanedLinks);
    });
}

// Routes

router.get('/feed', (req, res, next) => {

});

router.post('/createFeed', async (req, res, next) => {
    const feedsRef = db.collection('feeds');
    const cleanedTitle = cleanTitle(req.body.baseUrl);

    // const cleanedDayOfWeek = cleanDayOfWeek(req.body.dayOfWeek);

    await feedsRef.add({
      entries: req.body.links,
      schedule: {
        // dayOfWeek: cleanedDayOfWeek,
        frequency: Number(req.body.frequency),
        lastSent: null,
      },
      recipientEmail: req.body.recipientEmail,
      baseUrl: req.body.baseUrl,
      sourceTitle: cleanedTitle,
      isActive: true
    }).then(
        res.render('complete', 
            { 
                title: 'Blog Backlog',
                data: {
                    numLinks: req.body.links.length,
                    recipientEmail: req.body.recipientEmail.trim(),
                    frequency: req.body.frequency,
                    baseUrl: req.body.baseUrl,
                },
            }
        )
    );
});

router.post('/parseUrls', async (req, res, next) => {
    var url = req.body.baseUrl.trim();
    if (!url.includes('http')) {
        url = 'http://' + url;
    }
    parseWebpage(url, (cleanedLinks) => {

        res.render('saveChanges', 
            { 
                title: 'Blog Backlog',
                data: {
                    links: cleanedLinks,
                    baseUrl: url,
                },
            }
        );
    });
});

module.exports = router;