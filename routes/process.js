var express = require('express');
var router = express.Router();
const { DateTime } = require('luxon');
var domParser = require('html-dom-parser');
const request = require('request'); // Anyone know if these should be var or const?
const dotenv = require("dotenv");
var logStatus = true;

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

//
// Helpers and Cleaners
//

const parentTypes = {
    HEADER: 'header',
    PARAGRAPH: 'paragraph',
    UNKNOWN: 'unknown',
    LI: 'li',
};

function cleanDayOfWeek(dayString) {
    return(DateTime.fromFormat(dayString, "EEEE").weekday);
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

    if (logStatus) { console.log(cleaned); };
    return(cleaned);
}

function cleanLinks(links, baseUrl) {
    var cleanedLinks = [];
    if (baseUrl.slice(-1) !== "/") {
        baseUrl = baseUrl.concat("/");
    }

    for (idx in links) {
        var link = links[idx];

        // Replace any strange characters
        const toReplace = {
            " ": "",
            "&#x2F;": "/",
        };

        for (const key in toReplace) {
            link = link.replace(key, toReplace[key]);
        }

        // Check for non-links
        var broke = false;
        const banned = [".rss", ".xml", ".jpg", ".png", "mailto:", "?share=facebook", "?share=google", "?share=twitter", "?share=reddit", "?share=linkedin"];
        for (item of banned) {
            if (link.includes(item)) {
                // if (logStatus) { console.log(link, item); };
                broke = true;
                break;
            }
        }
        if (broke) {
            continue;
        }

        // Ensure all links are full URL
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

    // If there's a self-link, remove it
    if (cleanedLinks.includes(baseUrl)) {
        cleanedLinks.splice(cleanedLinks.indexOf(baseUrl), 1);
    }

    return(cleanedLinks);
}

// Merges two dicts
function mergeDicts(a,b) {
    const result = { ...a};
    
    for (key in b) {
        if (key in result) {
            continue;
        } else {
            result[key] = b[key];
        }
    }

    return(result);
}

//
// Link finders
//

function findRoot(parsed) {
    var candidates = [];

    for (item of parsed) {
        if ('children' in item) {
            candidates.push(item);
        }
    }

    return(candidates);
}

function traverser(node, depth, parentName) {
    var res = {};

    // First, check if current node is a link
    if (!node.attribs) {
        return(res);
    }

    if (node.name === 'a' && node.attribs.href) {
        if (!(node.attribs.href in res)) {
            res[node.attribs.href] = {
                'depth': depth,
                'attribs': node.attribs,
                'url': node.attribs.href,
                'parentName': parentName,
                'scoring': {
                    'score': 0,
                    'depthFrequencyRanking': 0,
                    'containsBannedWords': false,
                    'containsHeader': false,
                }
            };
        }
    }

    if (logStatus) {
        // console.log("-----");
        // console.log(node.name);
        // console.log(node.type);
        // console.log(node.attribs);
        // console.log(node);
    }

    // Then, recursive call on children to check if they contain links

    var newParentName = parentName;
    const headerTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    if (newParentName === parentTypes.UNKNOWN) {
        if (headerTags.includes(node.name)) {
            newParentName = parentTypes.HEADER;
        } else if (node.name === 'p') {
            newParentName = parentTypes.PARAGRAPH;
        } else if (node.name === 'li') {
            newParentName = parentTypes.LI;
        }
    }

    for (childIdx in node.children) {
        const child = node.children[childIdx];

        var childrenResults = traverser(child, depth + 1, newParentName);

                 // As a heuristic, most "title" elements where the link to a post is held will only have one link.
        // If multiple are discovered, it's like in the body of an excerpt of post itself.
        // var numLinksInDirectChildren = 0;
        // const directChildrenLinks = {};

        // if (numLinksInDirectChildren > 0) {
        //     childrenResults = mergeDicts(directChildrenLinks, childrenResults);
        // }

        res = mergeDicts(res, childrenResults);
    }

    return(res);
}

async function parseWebpage(url, callback) {
    const options = {
        'url' : url,
        headers: {
            'User-Agent': 'request'
        }
    };
    request(options, (err, res, body) => {
        const nodes = findRoot(domParser(body));
        var foundLinks = {}; // dict of [link: weight]

        for (node of nodes) {
            foundLinks = mergeDicts(foundLinks, traverser(node, 0, parentTypes.UNKNOWN));
        }
        
        // if (logStatus) { console.log(foundLinks); }
        
        foundLinks = scoreBannedContent(foundLinks);
        foundLinks = scoreDepthSiblings(foundLinks);

        // const cleanedLinks = cleanLinks(foundLinks, url);
        if (logStatus) { console.log(foundLinks); };

        callback(foundLinks);
    });
}

//
// Link Scorers
//

function scoreBannedContent(links) {
    var newLinks = { ... links};

    // If we can detect headers / sidebars, that'd cut out a lot of noise
    const sections = ['class', 'id', 'role'];
    const extraneous = ['sidebar', 'nav', 'footer', 'tag'];

    for (const link in newLinks) {
        for (const section of sections) {
            const linkData = links[link];
            if (section in linkData.attribs) {
                for (item of extraneous) {
                    if (linkData.attribs[section].toLowerCase().includes(item)) {
                        linkData.scoring.containsBannedWords = true;
                    }
                }

                if (linkData.attribs[section].toLowerCase().includes('header')) {
                    linkData.scoring.containsHeader = true;
                }
            }
        }
    }

    return (newLinks);
}

function scoreDepthSiblings(links) {
    var depthMap = {};
    var newLinks = { ... links};

    // First pass to build depthMap
    for (const link in newLinks) {
        const linkData = newLinks[link];

        if (linkData.depth in depthMap) {
            depthMap[linkData.depth] = depthMap[linkData.depth] + 1;
        } else {
            depthMap[linkData.depth] = 1;
        }
    }

    // Convert depthMap to relative ranking, ordered most to least frequent
    var depthsByFrequency = [];
    for (const depth in depthMap) {
        depthsByFrequency.push({
            'key': depth,
            'value': depthMap[depth]
        });
    }
    depthsByFrequency = depthsByFrequency.sort((a,b) => {return(a['value'] - b['value'])});
    depthsByFrequency = depthsByFrequency.map((x) => {return(parseInt(x['key']))});
    depthsByFrequency.reverse();

    // Add depthFrequencyRanking to each link
    for (const link in newLinks) {
        newLinks[link].scoring.depthFrequencyRanking = depthsByFrequency.indexOf(newLinks[link]['depth']) + 1;
    }

    return (newLinks);
}

function score(links) {
    for (const link in links) {

    }
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


function setLogStatus(status) {
    logStatus = status;
}

exports.processRouter = router;
exports.processFunc = (url, callback) => {parseWebpage(url, callback)};
exports.setLogStatus = (status) => {setLogStatus(status)};