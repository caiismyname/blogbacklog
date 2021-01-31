const express = require('express');
const router = express.Router();
const dotenv = require('dotenv');
const mailgun = require("mailgun-js");
const DOMAIN = 'mail.blogbacklog.com';
const { processFunc, extractBaseTitle } = require("../routes/linkExtractor");

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

function splitManualInputLinks(input) {
    const spaceStripped = input.replace(" ", "");
    const separated = spaceStripped.split(",");
    const emptiesRemoved = separated.filter((x) => x.length > 0);

    return (emptiesRemoved);
}

function sendWelcomeEmail(links, info, id) {
    // Mailgun Initialization
    const mg = mailgun({apiKey: process.env.MAILGUN_KEY, domain: DOMAIN});

    // Prepare data for sending the welcome email
    const cleanedTitle = extractBaseTitle(info.baseUrl);
    const cleanedLinks = links.reduce((accum, link) => accum + '- ' + link + '\n', '');
    const data = {
        from: 'Blog Backlog <send@mail.blogbacklog.com>',
        to: info.recipientEmail,
        subject: 'Welcome to BlogBacklog',
        text: 'Thank you for using BlogBacklog!\n\n'
            + 'You\'ll receive the following links from ' + cleanedTitle
            + '. A link will be sent every ' +  info.frequency + ' day(s).\n\n'
            + cleanedLinks
            + "\n\n" + "Unsubscribe link: blogbacklog.com/unsubscribe/" + id,
    };

    mg.messages().send(data, function (error, body) {
        if (body) {
            console.log(body);
        }
        if (error) {
            console.log(error);
        }
    });
}

// Routes

// // Empty endpoint for now, intended to host a "view/edit" feature.
// router.get('/feed', (req, res, next) => {
// });

router.post('/createFeed', async (req, res, next) => {
    const feedsRef = db.collection('feeds');
    const cleanedTitle = extractBaseTitle(req.body.baseUrl);

    const manualInputedLinks = splitManualInputLinks(req.body.manualLinks);
    const allLinks = req.body.links.concat(manualInputedLinks);

    await feedsRef.add({
      entries: allLinks,
      schedule: {
        frequency: Number(req.body.frequency),
        lastSent: null,
      },
      recipientEmail: req.body.recipientEmail,
      baseUrl: req.body.baseUrl,
      sourceTitle: cleanedTitle,
      isActive: true
    }).then((fbRes) => {
        sendWelcomeEmail(allLinks, req.body, fbRes.id);
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
    });
});

router.post('/parse', async (req, res, next) => {
    var url = req.body.baseUrl.trim();
    if (!url.includes('http')) {
        url = 'http://' + url;
    }
    processFunc(url, (cleanedLinks) => {
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

exports.processRouter = router;